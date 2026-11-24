import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { type RunningServer, startServer } from "../src/server/server";

// 画面のファイル（ビルドで src/server/web にできる）は、ここでは配らない
vi.mock("sirv", () => ({ default: () => (_req: unknown, _res: unknown, next: () => void) => next() }));

let tmp: string, opened: string, other: string, server: RunningServer, ws: WebSocket;
let nextId = 1;

/** 画面と同じように、WebSocket で1つ要求して、応答（result か error）を待つ */
type Reply = { id?: number; result?: unknown; error?: { code: string } };
function call(method: string, params: Record<string, unknown>): Promise<Reply> {
  const id = nextId++;
  return new Promise((resolve) => {
    const onMessage = (raw: Buffer) => {
      const msg = JSON.parse(raw.toString()) as Reply;
      if (msg.id !== id) return;
      ws.off("message", onMessage);
      resolve(msg);
    };
    ws.on("message", onMessage);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

beforeAll(async () => {
  tmp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "cgui-srv-")));
  opened = path.join(tmp, "opened");
  other = path.join(tmp, "other");
  for (const d of [opened, other]) {
    await fs.mkdir(d);
    await fs.writeFile(path.join(d, "a.txt"), "needle\n");
  }
  server = await startServer({ port: 0 });
  await server.addProject(opened);
  ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws?t=${server.token}`);
  await new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
});
afterAll(async () => {
  ws?.close();
  await server?.close();
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("search.files / search.text（WebSocket）", () => {
  it("開いているプロジェクトなら、ファイルの一覧を返す", async () => {
    expect(await call("search.files", { root: opened })).toMatchObject({ result: { files: ["a.txt"], truncated: false } });
  });
  it("開いているプロジェクトなら、本文を探す", async () => {
    const r = await call("search.text", { root: opened, query: "needle" });
    expect(r).toMatchObject({ result: { hits: [{ path: "a.txt", line: 1 }], truncated: false } });
  });
  it("開いていないフォルダの一覧は、forbidden で断る", async () => {
    expect(await call("search.files", { root: other })).toMatchObject({ error: { code: "forbidden" } });
  });
  it("開いていないフォルダの本文検索は、forbidden で断る", async () => {
    expect(await call("search.text", { root: other, query: "needle" })).toMatchObject({ error: { code: "forbidden" } });
  });
  it("正しくない正規表現は、bad_request で断る", async () => {
    const r = await call("search.text", { root: opened, query: "(", opts: { regexp: true } });
    expect(r).toMatchObject({ error: { code: "bad_request" } });
  });
});
