import fs from "node:fs/promises";
import path from "node:path";
import type { Entry, ReadResult } from "../shared/protocol.js";
import { isInside } from "./paths.js";

export const IMAGE_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
};
const SNIFF_BYTES = 8192;
const MAX_TEXT_BYTES = 2 * 1024 * 1024;

/** 図解（HTML）が読み込んでよい、画面まわりのファイル。これ以外（テキスト、設定など）は配らない。 */
export const ASSET_TYPES: Record<string, string> = {
  ...IMAGE_TYPES,
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
};

export class FsError extends Error {
  constructor(
    public code: "forbidden" | "not_found" | "not_dir" | "not_file" | "bad_request" | "conflict" | "exists",
    message: string,
  ) {
    super(message);
  }
}

export function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i <= 0 ? "" : name.slice(i + 1).toLowerCase();
}

/** 先頭の数 KB を見て、テキストかどうかを判定する（拡張子では決めない）。 */
export function looksLikeText(buf: Uint8Array): boolean {
  if (buf.includes(0)) return false;
  try {
    // stream: true なら、末尾で途切れたマルチバイト文字は許される
    new TextDecoder("utf-8", { fatal: true }).decode(buf, { stream: true });
    return true;
  } catch {
    return false;
  }
}

async function sniff(file: string, size: number): Promise<Uint8Array> {
  const fh = await fs.open(file, "r");
  try {
    const buf = Buffer.alloc(Math.min(size, SNIFF_BYTES));
    const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await fh.close();
  }
}

export class Files {
  /** 読み書きを許す場所: ホームと、開いているプロジェクトのフォルダ。 */
  constructor(
    public readonly home: string,
    private readonly roots: Set<string>,
  ) {}

  /** realpath で実体を確かめ、許す場所の外なら断る。 */
  async resolve(p: unknown): Promise<string> {
    if (typeof p !== "string" || !path.isAbsolute(p)) throw new FsError("bad_request", "絶対パスで指定してください");
    let real: string;
    try {
      real = await fs.realpath(p);
    } catch {
      throw new FsError("not_found", "見つかりません");
    }
    const allowed = [this.home, ...this.roots].some((r) => isInside(r, real));
    if (!allowed) throw new FsError("forbidden", "このフォルダは開けません");
    return real;
  }

  async list(dir: unknown): Promise<{ dir: string; entries: Entry[] }> {
    const real = await this.resolve(dir);
    const st = await fs.stat(real);
    if (!st.isDirectory()) throw new FsError("not_dir", "フォルダではありません");
    const names = await fs.readdir(real);
    const entries = (
      await Promise.all(
        names.map(async (name): Promise<Entry | null> => {
          const full = path.join(real, name);
          try {
            const s = await fs.stat(full); // シンボリックリンクは先を見る
            if (s.isDirectory()) return { name, kind: "dir", size: 0, mtime: s.mtimeMs };
            if (!s.isFile()) return null;
            if (IMAGE_TYPES[extOf(name)]) return { name, kind: "image", size: s.size, mtime: s.mtimeMs };
            const text = s.size === 0 || looksLikeText(await sniff(full, s.size));
            return { name, kind: text ? "text" : "binary", size: s.size, mtime: s.mtimeMs };
          } catch {
            return null; // 壊れたリンクなどは出さない
          }
        }),
      )
    ).filter((e): e is Entry => e !== null);
    entries.sort((a, b) => {
      if ((a.kind === "dir") !== (b.kind === "dir")) return a.kind === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name, "ja", { numeric: true });
    });
    return { dir: real, entries };
  }

  async read(p: unknown): Promise<ReadResult> {
    const real = await this.resolve(p);
    const st = await fs.stat(real);
    if (!st.isFile()) throw new FsError("not_file", "ファイルではありません");
    if (IMAGE_TYPES[extOf(real)]) return { kind: "image", size: st.size };
    if (st.size > MAX_TEXT_BYTES) return { kind: "unsupported", reason: "large", size: st.size };
    const buf = await fs.readFile(real);
    if (!looksLikeText(buf.subarray(0, SNIFF_BYTES))) return { kind: "unsupported", reason: "binary", size: st.size };
    return { kind: "text", text: buf.toString("utf8"), size: st.size, mtime: st.mtimeMs };
  }

  /** テキストファイルを書き換える。baseMtime が今と違えば、外で変わったとして断る（上書きしない）。 */
  async write(p: unknown, text: unknown, baseMtime: unknown): Promise<{ mtime: number }> {
    if (typeof text !== "string") throw new FsError("bad_request", "本文が正しくありません");
    const real = await this.resolve(p);
    const st = await fs.stat(real);
    if (!st.isFile()) throw new FsError("not_file", "ファイルではありません");
    if (typeof baseMtime === "number" && Math.abs(st.mtimeMs - baseMtime) > 1)
      throw new FsError("conflict", "ファイルが外で書き換えられています");
    await fs.writeFile(real, text, "utf8");
    return { mtime: (await fs.stat(real)).mtimeMs };
  }

  /** 同じフォルダの中で、名前を変える。 */
  async rename(p: unknown, name: unknown): Promise<{ path: string }> {
    if (typeof name !== "string" || !name || name === "." || name === ".." || /[/\\\0]/.test(name))
      throw new FsError("bad_request", "名前が正しくありません");
    const real = await this.resolve(p);
    if (real === this.home) throw new FsError("forbidden", "名前を変えられません");
    const target = path.join(path.dirname(real), name);
    if (target === real) return { path: real };
    const exists = await fs.lstat(target).then(() => true, () => false);
    if (exists) throw new FsError("exists", "同じ名前のものがあります");
    await fs.rename(real, target);
    return { path: target };
  }

  /** ファイルやフォルダ（中身ごと）を削除する。ホームとルートは消さない。 */
  async delete(p: unknown): Promise<void> {
    if (typeof p !== "string" || !path.isAbsolute(p)) throw new FsError("bad_request", "絶対パスで指定してください");
    // リンクそのものを消せるように、末尾は realpath しない（親の実体で場所を確かめる）
    const parent = await this.resolve(path.dirname(path.normalize(p)));
    const target = path.join(parent, path.basename(p));
    if (target === this.home || target === path.parse(target).root) throw new FsError("forbidden", "削除できません");
    await fs.rm(target, { recursive: true });
  }

  /** 画像として配ってよいファイルか確かめ、実体のパスと型を返す。 */
  imageFile(p: unknown) {
    return this.staticFile(p, IMAGE_TYPES, "画像ではありません");
  }

  /** types にある拡張子のファイルだけを配る。 */
  async staticFile(p: unknown, types: Record<string, string>, msg = "配れないファイルです"): Promise<{ real: string; type: string; size: number }> {
    const real = await this.resolve(p);
    const type = types[extOf(real)];
    if (!type) throw new FsError("forbidden", msg);
    const st = await fs.stat(real);
    if (!st.isFile()) throw new FsError("not_file", "ファイルではありません");
    return { real, type, size: st.size };
  }
}
