// 画面とサーバーで共通の、要求・応答・通知の型。

export type EntryKind = "dir" | "text" | "image" | "binary";

export interface Entry {
  name: string;
  kind: EntryKind;
  size: number;
  mtime: number;
}

export type ReadResult =
  | { kind: "text"; text: string; size: number; mtime: number }
  | { kind: "image"; size: number }
  | { kind: "unsupported"; reason: "binary" | "large"; size: number };

/** git の状態。パスは、プロジェクトのフォルダからの相対パス。 */
export interface GitFile {
  path: string;
  /** M 変更 / A 追加 / D 削除 / R 名前変更 / ? 未追跡 / U 衝突 */
  status: "M" | "A" | "D" | "R" | "?" | "U";
}
export interface Commit {
  hash: string;
  short: string;
  subject: string;
  author: string;
  /** UNIX 秒 */
  time: number;
}

export interface Settings {
  version: 1;
  /** プロジェクト（フォルダの絶対パス）ごとのファイルのブックマーク。パスはプロジェクトからの相対 */
  projects: { path: string; bookmarks: string[] }[];
  /** ブックマークしたプロジェクト（フォルダの絶対パス） */
  favoriteProjects: string[];
  layout: {
    listWidth: number;
    panels: { projectTabs: boolean; list: boolean; previewTabs: boolean; status: boolean };
  };
}

export interface MethodMap {
  hello: { params: Record<string, never>; result: { home: string; projects: string[]; previewPort: number } };
  "project.open": { params: { path: string }; result: { path: string } };
  "project.close": { params: { path: string }; result: Record<string, never> };
  "fs.list": { params: { dir: string }; result: { dir: string; entries: Entry[] } };
  "fs.read": { params: { path: string }; result: ReadResult };
  /** baseMtime が今のファイルとずれていたら、"conflict" で断る */
  "fs.write": { params: { path: string; text: string; baseMtime?: number }; result: { mtime: number } };
  "fs.rename": { params: { path: string; name: string }; result: { path: string } };
  "fs.delete": { params: { path: string }; result: Record<string, never> };
  "git.status": { params: { root: string }; result: { isRepo: boolean; files: GitFile[] } };
  "git.log": { params: { root: string }; result: { commits: Commit[] } };
  "git.diff": { params: { root: string; path?: string; hash?: string }; result: { patch: string; truncated: boolean } };
  "settings.get": { params: Record<string, never>; result: Settings };
  "settings.set": { params: { settings: Settings }; result: Record<string, never> };
}
export type Method = keyof MethodMap;

export interface Request<M extends Method = Method> {
  id: number;
  method: M;
  params: MethodMap[M]["params"];
}
export type Response =
  | { id: number; result: unknown }
  | { id: number; error: { code: string; message: string } };

export type ServerEvent =
  | { event: "fs.changed"; root: string; paths: string[] }
  | { event: "git.changed"; root: string }
  | { event: "project.open"; path: string };

/** 画像などをサーバーから取る URL（`<img src>` 用）。 */
export function fileUrl(path: string, token: string): string {
  return `/file?path=${encodeURIComponent(path)}&t=${encodeURIComponent(token)}`;
}
