import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_PORT, parseArgs } from "./args.js";
import { type Lock, loadToken, logPath, readLock, removeLock, writeLock } from "./lock.js";
import { openBrowser } from "./open-browser.js";
import { startServer } from "./server.js";

const USAGE = `使い方:
  cgui [フォルダ]     フォルダをプロジェクトとして開き、ブラウザも開く（省略すると今のフォルダ）
  cgui stop           動いているサーバーを止める
  cgui --no-open ...  ブラウザを開かず、URL を表示するだけにする
  cgui --port N ...   ポートを指定する（既定 ${DEFAULT_PORT}。環境変数 CGUI_PORT でも指定できる）
  cgui -h, --help     この説明`;

function tailLog(): string {
  try {
    return fs.readFileSync(logPath(), "utf8").slice(-2000);
  } catch {
    return "";
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function post(lock: Lock, route: string, body: unknown): Promise<Response | null> {
  try {
    return await fetch(`http://127.0.0.1:${lock.port}${route}`, {
      method: "POST",
      headers: { "x-cgui-token": lock.token, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    return null;
  }
}

/** サーバーを背景で起動し、ロックファイルができるのを待つ。 */
async function spawnDaemon(port: number): Promise<Lock | null> {
  fs.mkdirSync(path.dirname(logPath()), { recursive: true });
  const log = fs.openSync(logPath(), "w"); // 起動に失敗したとき、今回の原因だけが残るようにする
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), "--daemon", `--port=${port}`], {
    detached: true,
    stdio: ["ignore", log, log],
  });
  child.unref();
  for (let i = 0; i < 50; i++) {
    await sleep(100);
    const l = readLock();
    if (l && l.pid === child.pid) return l;
  }
  return null;
}

async function runDaemon(port: number): Promise<void> {
  let stopping = false;
  const token = loadToken();
  const srv = await startServer({ port, token, onStop: () => void stop() });
  async function stop() {
    if (stopping) return;
    stopping = true;
    removeLock();
    await srv.close().catch(() => {});
    process.exit(0);
  }
  writeLock({ pid: process.pid, port: srv.port, token });
  process.on("SIGTERM", () => void stop());
  process.on("SIGINT", () => void stop());
  console.log(`cgui server started: pid=${process.pid} port=${srv.port}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--daemon")) return runDaemon(parseArgs(args).port);
  if (args.includes("-h") || args.includes("--help")) return void console.log(USAGE);

  const { port, open, rest } = parseArgs(args);

  if (rest[0] === "stop") {
    const lock = readLock();
    if (!lock || !(await post(lock, "/__stop", {}))) {
      removeLock(lock?.pid);
      return void console.log("動いているサーバーはありません");
    }
    return void console.log("サーバーを止めました");
  }

  const target = path.resolve(rest[0] ?? ".");
  if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) {
    console.error(`フォルダが見つかりません: ${target}`);
    process.exit(1);
  }

  // すでに動いているサーバーがあれば、そこにプロジェクトを足す
  let lock = readLock();
  let res = lock ? await post(lock, "/__open", { path: target }) : null;
  if (!res) {
    lock = await spawnDaemon(port);
    res = lock ? await post(lock, "/__open", { path: target }) : null;
  }
  if (!lock || !res || !res.ok) {
    const busy = /EADDRINUSE/.test(tailLog());
    console.error(
      busy
        ? `ポート ${port} は、ほかのプログラムが使っています。--port で別の番号を指定してください。`
        : `サーバーを起動できませんでした。ログ: ${logPath()}`,
    );
    process.exit(1);
  }
  const { clients } = (await res.json()) as { clients: number };
  const url = `http://127.0.0.1:${lock.port}/?t=${lock.token}`;
  console.log(`cgui: ${target}\n${url}`);
  // 画面がすでに開いていれば、そこにタブが増えるので開かない
  if (!open || clients > 0) return;
  if (!(await openBrowser(url))) console.log("ブラウザを開けませんでした。上の URL を開いてください。");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
