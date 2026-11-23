import fs from "node:fs/promises";
import path from "node:path";
import type { TextHit } from "../shared/protocol.js";
import { MAX_TEXT_BYTES, SNIFF_BYTES, looksLikeText } from "./fs.js";
import { git, toplevel } from "./git.js";

const MAX_FILES = 20000;
const MAX_HITS = 500;
const PARALLEL = 16;
const MAX_LINE = 200;
/** 長い行を切り詰めるとき、一致の前に残す文字数 */
const LEAD = 40;
const SKIP_DIRS = new Set([".git", "node_modules"]);

/** 並列数を絞って、items を順に処理する。stop() が true になったら、新しい処理は始めない。 */
async function pool<T>(items: T[], run: (item: T) => Promise<void>, stop: () => boolean = () => false): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length && !stop()) await run(items[next++]!);
  };
  await Promise.all(Array.from({ length: PARALLEL }, worker));
}

async function gitFiles(root: string): Promise<string[] | null> {
  const r = await git(root, ["ls-files", "-z", "-co", "--exclude-standard"]);
  if (!r.ok) return null;
  // -co は、追跡済みと未追跡で同じパスを2回出すことがある（変更中の追跡ファイルなど）
  const listed = [...new Set(r.stdout.split("\0").filter(Boolean))];
  const keep = new Array<boolean>(listed.length).fill(false);
  // 追跡済みでも作業ツリーから消えたもの、サブモジュール（フォルダ）は落とす
  await pool(listed.map((_, i) => i), async (i) => {
    keep[i] = await fs.stat(path.join(root, listed[i]!)).then((s) => s.isFile(), () => false);
  });
  return listed.filter((_, i) => keep[i]);
}

async function walkFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  const walk = async (dir: string, rel: string): Promise<void> => {
    if (out.length > MAX_FILES) return;
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      if (out.length > MAX_FILES) return;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) await walk(path.join(dir, e.name), r);
      } else if (e.isFile()) {
        out.push(r);
      } else if (e.isSymbolicLink()) {
        // リンク先がフォルダなら入らない（循環やプロジェクト外への広がりを避ける）
        if (await fs.stat(path.join(dir, e.name)).then((s) => s.isFile(), () => false)) out.push(r);
      }
    }
  };
  await walk(root, "");
  return out;
}

/** root からの相対パス（`/` 区切り）。git なら .gitignore に従い、そうでなければ自前で歩く。 */
export async function listFiles(root: string): Promise<{ files: string[]; truncated: boolean }> {
  const all = ((await toplevel(root)) ? await gitFiles(root) : null) ?? (await walkFiles(root));
  all.sort();
  return { files: all.slice(0, MAX_FILES), truncated: all.length > MAX_FILES };
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** 一致行を、先頭の空白を詰め、長ければ一致の手前から切り詰めて返す。from/to は返す text の添字。 */
function hitLine(line: string, from: number, len: number): { text: string; from: number; to: number } {
  if (from < line.length - line.trimStart().length) return { text: line, from, to: from + len }; // 一致が先頭の空白の中にある
  const trimmed = line.trimStart();
  from -= line.length - trimmed.length;
  if (trimmed.length <= MAX_LINE) return { text: trimmed, from, to: from + len };
  const start = Math.max(0, from - LEAD);
  const head = start > 0 ? "…" : "";
  const text = head + trimmed.slice(start, start + MAX_LINE);
  const f = from - start + head.length;
  return { text, from: f, to: Math.min(f + len, text.length) };
}

export async function searchText(root: string, query: string): Promise<{ hits: TextHit[]; truncated: boolean }> {
  if (!query.trim()) return { hits: [], truncated: false };
  // 利用者の入力は正規表現として扱わない。添字を元の行に合わせるため、toLowerCase ではなく i フラグで比べる
  const re = new RegExp(escapeRe(query), "i");
  const listed = await listFiles(root);
  const hits: TextHit[] = [];
  // 上限を1件超えるまで集めて、打ち切ったかどうかを知る
  const full = () => hits.length > MAX_HITS;

  await pool(
    listed.files,
    async (rel) => {
      const abs = path.join(root, rel);
      const st = await fs.stat(abs).catch(() => null);
      if (!st || st.size > MAX_TEXT_BYTES) return;
      const buf = await fs.readFile(abs).catch(() => null);
      if (!buf || !looksLikeText(buf.subarray(0, SNIFF_BYTES))) return;
      const content = buf.toString("utf8");
      if (!re.test(content)) return;
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!.replace(/\r$/, "");
        const m = re.exec(line);
        if (!m) continue;
        if (full()) return;
        hits.push({ path: rel, line: i + 1, ...hitLine(line, m.index, m[0].length) });
      }
    },
    full,
  );
  hits.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : a.line - b.line));
  return { hits: hits.slice(0, MAX_HITS), truncated: listed.truncated || full() };
}
