import type { Method, MethodMap, ServerEvent } from "../../shared/protocol";

/** 画面がサーバーとやりとりする窓口。中身（WebSocket / Tauri）は差し替えられる。 */
export interface Backend {
  call<M extends Method>(method: M, params: MethodMap[M]["params"]): Promise<MethodMap[M]["result"]>;
  onEvent(cb: (ev: ServerEvent) => void): () => void;
  onStatus(cb: (connected: boolean) => void): () => void;
  /** 画像などを `<img src>` で取る URL */
  fileUrl(path: string): string;
}

export class BackendError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
