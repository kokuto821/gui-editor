import crypto from "node:crypto";
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
export const tokenPath = () => path.join(cacheDir(), "token");

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

/** URL の ?t= に使うトークン。再起動してもブックマークした URL で開けるよう、ファイルに残して使い回す。 */
export function loadToken(): string {
  const file = tokenPath();
  try {
    const t = fs.readFileSync(file, "utf8").trim();
    if (/^[0-9a-f]{48}$/.test(t)) {
      fs.chmodSync(file, 0o600);
      return t;
    }
  } catch {}
  const t = crypto.randomBytes(24).toString("hex");
  fs.mkdirSync(cacheDir(), { recursive: true });
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, t, { mode: 0o600 });
  fs.renameSync(tmp, file);
  return t;
}
