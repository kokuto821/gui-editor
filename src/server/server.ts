import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sirv from "sirv";
import { WebSocket, WebSocketServer } from "ws";
import type { Response, ServerEvent } from "../shared/protocol.js";
import { ASSET_TYPES, FsError, Files, asFsError } from "./fs.js";
import { isInside } from "./paths.js";
import * as git from "./git.js";
import * as search from "./search.js";
import { loadSettings, saveSettings, sanitize } from "./settings.js";
import { Watchers } from "./watch.js";

export interface RunningServer {
  port: number;
  token: string;
  addProject(path: string): Promise<string>;
  close(): Promise<void>;
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

async function readBody(req: http.IncomingMessage, limit = 64 * 1024): Promise<string> {
  const chunks: Buffer[] = [];
  let n = 0;
  for await (const c of req) {
    n += (c as Buffer).length;
    if (n > limit) throw new Error("too large");
    chunks.push(c as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function startServer(opts: { port: number; onStop?: () => void }): Promise<RunningServer> {
  const home = await fsp.realpath(os.homedir());
  const roots = new Set<string>();
  const projects: string[] = [];
  const files = new Files(home);
  const token = crypto.randomBytes(24).toString("hex");
  const clients = new Set<WebSocket>();

  const broadcast = (ev: ServerEvent) => {
    const data = JSON.stringify(ev);
    for (const c of clients) if (c.readyState === WebSocket.OPEN) c.send(data);
  };
  const watchers = new Watchers(
    (root, paths) => broadcast({ event: "fs.changed", root, paths }),
    (root) => broadcast({ event: "git.changed", root }),
  );

  async function addProject(p: unknown): Promise<string> {
    if (typeof p !== "string" || !path.isAbsolute(p)) throw new FsError("bad_request", "絶対パスで指定してください");
    const real = await fsp.realpath(p).catch(() => {
      throw new FsError("not_found", "見つかりません");
    });
    if (!(await fsp.stat(real)).isDirectory()) throw new FsError("not_dir", "フォルダではありません");
    if (!roots.has(real)) {
      roots.add(real);
      projects.push(real);
      // ホームとその上（ルートまで）は監視しない（巨大で、監視の上限を使い切るため）。そのときは、画面を開き直すか戻ったときに読み直す
      if (!isInside(real, home)) await watchers.add(real).catch(() => {}); // 監視できなくても表示は続ける
    }
    broadcast({ event: "project.open", path: real });
    return real;
  }

  async function closeProject(p: unknown): Promise<void> {
    if (typeof p !== "string") return;
    const i = projects.indexOf(p);
    if (i < 0) return;
    projects.splice(i, 1);
    roots.delete(p);
    await watchers.remove(p);
  }

  /** git の呼び出しは、開いているプロジェクトのフォルダだけに許す。 */
  const gitRoot = async (r: unknown): Promise<string> => {
    const real = await files.resolve(r);
    if (!roots.has(real)) throw new FsError("forbidden", "開いているプロジェクトではありません");
    return real;
  };

  const webDir = fileURLToPath(new URL("./web/", import.meta.url));
  const serveStatic = sirv(webDir, { etag: true, dev: false });
  let port = 0;

  const hostOk = (host: string | undefined) => host === `127.0.0.1:${port}` || host === `localhost:${port}`;
  const originOk = (origin: string | undefined) =>
    origin === undefined || origin === `http://127.0.0.1:${port}` || origin === `http://localhost:${port}`;

  const server = http.createServer(async (req, res) => {
    const send = (status: number, body: unknown, type = "application/json") => {
      res.writeHead(status, { "content-type": type, "cache-control": "no-store", "x-content-type-options": "nosniff" });
      res.end(typeof body === "string" ? body : JSON.stringify(body));
    };
    if (!hostOk(req.headers.host)) return send(403, { error: "bad host" });
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

    try {
      if (url.pathname === "/__open" || url.pathname === "/__stop") {
        if (req.method !== "POST" || !safeEqual(String(req.headers["x-cgui-token"] ?? ""), token))
          return send(403, { error: "forbidden" });
        if (url.pathname === "/__stop") {
          send(200, { ok: true });
          setTimeout(() => opts.onStop?.(), 20);
          return;
        }
        const body = JSON.parse((await readBody(req)) || "{}") as { path?: unknown };
        const real = await addProject(body.path);
        return send(200, { path: real, clients: clients.size });
      }

      if (url.pathname === "/file") {
        if (!safeEqual(url.searchParams.get("t") ?? "", token)) return send(403, { error: "forbidden" });
        const img = await files.imageFile(url.searchParams.get("path"));
        res.writeHead(200, {
          "content-type": img.type,
          "content-length": img.size,
          "cache-control": "no-cache",
          "x-content-type-options": "nosniff",
          // SVG を直接開かれても、スクリプトを動かさない
          "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        });
        fs.createReadStream(img.real).pipe(res);
        return;
      }

      serveStatic(req, res, () => send(404, { error: "not found" }));
    } catch (err) {
      const e = asFsError(err);
      if (e instanceof FsError) return send(e.code === "forbidden" ? 403 : 400, { error: e.message });
      send(500, { error: "internal error" });
    }
  });

  // 図解（HTML）用の別のサーバー。別のポート = 別のオリジンなので、図解から本体の API には届かない。
  // URL は /p/<トークン>/<絶対パス>。相対パスの CSS や画像が、そのまま解決できる。
  let previewPort = 0;
  const previewHostOk = (host: string | undefined) => host === `127.0.0.1:${previewPort}` || host === `localhost:${previewPort}`;
  const previewServer = http.createServer(async (req, res) => {
    const fail = (status: number) => {
      res.writeHead(status, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
      res.end("forbidden");
    };
    if (!previewHostOk(req.headers.host)) return fail(403);
    try {
      const m = /^\/p\/([0-9a-f]+)(\/.*)$/.exec(new URL(req.url ?? "/", "http://x").pathname);
      if (!m || !safeEqual(m[1]!, token)) return fail(403);
      const f = await files.staticFile(decodeURIComponent(m[2]!), ASSET_TYPES);
      res.writeHead(200, {
        "content-type": f.type,
        "content-length": f.size,
        "cache-control": "no-cache",
        "x-content-type-options": "nosniff",
        "access-control-allow-origin": "*", // 図解は opaque なオリジン。フォントを読めるように
        // 図解の中のリンクで直接開かれても、スクリプトは動かさない
        "content-security-policy": "sandbox",
      });
      fs.createReadStream(f.real).pipe(res);
    } catch (e) {
      if (e instanceof FsError && e.code === "not_found") return fail(404);
      fail(403);
    }
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });
  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    const ok =
      url.pathname === "/ws" &&
      hostOk(req.headers.host) &&
      originOk(req.headers.origin) &&
      safeEqual(url.searchParams.get("t") ?? "", token);
    if (!ok) {
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws));
  });

  wss.on("connection", (ws) => {
    clients.add(ws);
    ws.on("close", () => clients.delete(ws));
    ws.on("message", async (raw) => {
      let id = -1;
      const reply = (r: Response) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(r));
      try {
        const msg = JSON.parse(raw.toString()) as { id?: unknown; method?: unknown; params?: Record<string, unknown> };
        if (typeof msg.id !== "number") return;
        id = msg.id;
        const params = msg.params ?? {};
        let result: unknown;
        switch (msg.method) {
          case "hello":
            result = { home, projects, previewPort };
            break;
          case "fs.list":
            result = await files.list(params.dir);
            break;
          case "fs.read":
            result = await files.read(params.path);
            break;
          case "fs.write":
            result = await files.write(params.path, params.text, params.baseMtime);
            break;
          case "fs.rename":
            result = await files.rename(params.path, params.name);
            break;
          case "fs.delete":
            await files.delete(params.path);
            result = {};
            break;
          case "project.open":
            result = { path: await addProject(params.path) };
            break;
          case "project.close":
            await closeProject(params.path);
            result = {};
            break;
          case "git.status":
            result = await git.status(await gitRoot(params.root));
            break;
          case "git.log":
            result = { commits: await git.log(await gitRoot(params.root)) };
            break;
          case "git.diff": {
            const root = await gitRoot(params.root);
            const file = typeof params.path === "string" ? params.path : undefined;
            const hash = typeof params.hash === "string" ? params.hash : undefined;
            result = await git.diff(root, file, hash);
            break;
          }
          case "search.files":
            result = await search.listFiles(await gitRoot(params.root));
            break;
          case "search.text": {
            const root = await gitRoot(params.root);
            const o = (params.opts ?? {}) as Record<string, unknown>;
            const opts = { caseSensitive: o.caseSensitive === true, wholeWord: o.wholeWord === true, regexp: o.regexp === true };
            result = await search.searchText(root, typeof params.query === "string" ? params.query : "", opts);
            break;
          }
          case "settings.get":
            result = loadSettings();
            break;
          case "settings.set":
            saveSettings(sanitize(params.settings));
            result = {};
            break;
          default:
            return reply({ id, error: { code: "unknown_method", message: "未対応の操作です" } });
        }
        reply({ id, result });
      } catch (err) {
        if (id < 0) return;
        const e = asFsError(err);
        if (e instanceof FsError) reply({ id, error: { code: e.code, message: e.message } });
        else reply({ id, error: { code: "internal", message: "内部エラー" } });
      }
    });
  });

  // 127.0.0.1 だけで待ち受ける。ポートは固定（0 を渡したときだけ、空いているものを選ぶ）。
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.port, "127.0.0.1", () => resolve());
  });
  port = (server.address() as { port: number }).port;
  await new Promise<void>((resolve, reject) => {
    previewServer.once("error", reject);
    previewServer.listen(0, "127.0.0.1", () => resolve());
  });
  previewPort = (previewServer.address() as { port: number }).port;

  return {
    port,
    token,
    addProject,
    async close() {
      await watchers.close();
      for (const c of clients) c.close();
      await new Promise<void>((r) => server.close(() => r()));
      await new Promise<void>((r) => previewServer.close(() => r()));
    },
  };
}
