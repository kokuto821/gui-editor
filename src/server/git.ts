import { execFile } from "node:child_process";
import path from "node:path";
import type { Commit, GitFile } from "../shared/protocol.js";

const MAX_OUT = 8 * 1024 * 1024;
const MAX_PATCH = 1024 * 1024;

interface Out {
  ok: boolean;
  code: number;
  stdout: string;
}

/** git を読み取り専用で呼ぶ（書き込み系は呼ばない）。GIT_OPTIONAL_LOCKS=0 で、index のロックを取らない。 */
function git(cwd: string, args: string[], okCodes: number[] = [0]): Promise<Out> {
  return new Promise((resolve) => {
    execFile(
      "git",
      ["-c", "core.quotepath=off", "--no-pager", ...args],
      { cwd, maxBuffer: MAX_OUT, env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", LC_ALL: "C" } },
      (err, stdout) => {
        const code = err ? (typeof (err as { code?: unknown }).code === "number" ? (err as { code: number }).code : -1) : 0;
        resolve({ ok: okCodes.includes(code), code, stdout: String(stdout ?? "") });
      },
    );
  });
}

export async function toplevel(root: string): Promise<string | null> {
  const r = await git(root, ["rev-parse", "--show-toplevel"]);
  return r.ok ? r.stdout.trim() : null;
}

/** `git status --porcelain=v2 -z` の出力を読む。パスは root からの相対パスにし、root の外は除く。 */
export function parseStatus(out: string, top: string, root: string): GitFile[] {
  const files = new Map<string, GitFile>();
  const parts = out.split("\0");
  const rel = (p: string) => path.relative(root, path.join(top, p));
  const inside = (r: string) => r !== "" && !r.startsWith("..") && !path.isAbsolute(r);
  const kind = (xy: string): GitFile["status"] => {
    if (xy.includes("U") || xy === "AA" || xy === "DD") return "U";
    if (xy.includes("D")) return "D";
    if (xy.includes("A")) return "A";
    if (xy.includes("R") || xy.includes("C")) return "R";
    return "M";
  };
  for (let i = 0; i < parts.length; i++) {
    const rec = parts[i]!;
    if (!rec) continue;
    const t = rec[0];
    let file: string | null = null;
    let status: GitFile["status"] = "M";
    if (t === "1") {
      const f = rec.split(" ");
      status = kind(f[1] ?? "");
      file = f.slice(8).join(" ");
    } else if (t === "2") {
      const f = rec.split(" ");
      status = "R";
      file = f.slice(9).join(" ");
      i++; // 次の項目は、変更前のパス
    } else if (t === "u") {
      status = "U";
      file = rec.split(" ").slice(10).join(" ");
    } else if (t === "?") {
      status = "?";
      file = rec.slice(2);
    }
    if (!file) continue;
    const r = rel(file);
    if (inside(r)) files.set(r, { path: r, status });
  }
  return [...files.values()].sort((a, b) => a.path.localeCompare(b.path, "ja", { numeric: true }));
}

export async function status(root: string): Promise<{ isRepo: boolean; files: GitFile[] }> {
  const top = await toplevel(root);
  if (!top) return { isRepo: false, files: [] };
  const r = await git(root, ["status", "--porcelain=v2", "-z", "--untracked-files=all"]);
  return { isRepo: true, files: r.ok ? parseStatus(r.stdout, top, root) : [] };
}

export async function log(root: string, limit = 50): Promise<Commit[]> {
  const fmt = "%H%x1f%h%x1f%s%x1f%an%x1f%ct%x1e";
  const r = await git(root, ["log", `-n${limit}`, `--format=${fmt}`, "--", "."]);
  if (!r.ok) return []; // コミットがない、リポジトリではない、など
  return r.stdout
    .split("\x1e")
    .map((rec) => rec.replace(/^\n/, ""))
    .filter(Boolean)
    .map((rec) => {
      const [hash = "", short = "", subject = "", author = "", time = "0"] = rec.split("\x1f");
      return { hash, short, subject, author, time: Number(time) };
    });
}

const cut = (s: string) => (s.length > MAX_PATCH ? { patch: s.slice(0, MAX_PATCH), truncated: true } : { patch: s, truncated: false });

/** 作業ツリーのファイル（最後のコミットとの差）か、コミット1つの差分を、unified diff で返す。 */
export async function diff(root: string, file?: string, hash?: string): Promise<{ patch: string; truncated: boolean }> {
  const top = await toplevel(root);
  if (!top) return { patch: "", truncated: false };
  if (hash !== undefined) {
    if (!/^[0-9a-f]{4,40}$/.test(hash)) return { patch: "", truncated: false };
    const r = await git(root, ["show", "--format=", "-U3", "--no-color", "--no-ext-diff", hash, "--", "."]);
    return cut(r.stdout);
  }
  if (!file) return { patch: "", truncated: false };
  const abs = path.resolve(root, file);
  if (path.relative(root, abs).startsWith("..")) return { patch: "", truncated: false };
  const tracked = (await git(root, ["ls-files", "--error-unmatch", "--", abs])).ok;
  if (tracked) {
    const hasHead = (await git(root, ["rev-parse", "--verify", "-q", "HEAD"])).ok;
    const r = await git(root, ["diff", ...(hasHead ? ["HEAD"] : ["--cached"]), "-U3", "--no-color", "--no-ext-diff", "--", abs]);
    return cut(r.stdout);
  }
  // 未追跡: 空のファイルとの差として、全行を追加で出す（差があると終了コードは 1）
  const r = await git(root, ["diff", "--no-index", "-U3", "--no-color", "--", "/dev/null", abs], [0, 1]);
  return cut(r.stdout);
}
