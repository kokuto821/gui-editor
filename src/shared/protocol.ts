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

export interface MethodMap {
  hello: { params: Record<string, never>; result: { home: string; projects: string[] } };
  "fs.list": { params: { dir: string }; result: { dir: string; entries: Entry[] } };
  "fs.read": { params: { path: string }; result: ReadResult };
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
  | { event: "project.open"; path: string };

/** 画像などをサーバーから取る URL（`<img src>` 用）。 */
export function fileUrl(path: string, token: string): string {
  return `/file?path=${encodeURIComponent(path)}&t=${encodeURIComponent(token)}`;
}
