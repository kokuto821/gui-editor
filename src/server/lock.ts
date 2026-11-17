import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface Lock {
  pid: number;
  port: number;
  token: string;
}

function cacheDir(): string {
  return path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache"), "cgui");
}
export const lockPath = () => path.join(cacheDir(), "lock.json");
export const logPath = () => path.join(cacheDir(), "server.log");

export function readLock(): Lock | null {
  try {
    const l = JSON.parse(fs.readFileSync(lockPath(), "utf8")) as Lock;
    return typeof l.pid === "number" && typeof l.port === "number" && typeof l.token === "string" ? l : null;
  } catch {
    return null;
  }
}

export function writeLock(l: Lock): void {
  fs.mkdirSync(cacheDir(), { recursive: true });
  const tmp = lockPath() + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(l), { mode: 0o600 });
  fs.renameSync(tmp, lockPath());
}

export function removeLock(pid = process.pid): void {
  const l = readLock();
  if (l && l.pid === pid) fs.rmSync(lockPath(), { force: true });
}
