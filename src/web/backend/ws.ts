import type { Method, MethodMap, Response, ServerEvent } from "../../shared/protocol";
import { fileUrl } from "../../shared/protocol";
import { type Backend, BackendError } from "./types";

const TOKEN_KEY = "cgui.token";

function findToken(): string {
  try {
    const fromUrl = new URLSearchParams(location.search).get("t");
    if (fromUrl) {
      sessionStorage.setItem(TOKEN_KEY, fromUrl);
      history.replaceState(null, "", location.pathname); // アドレスからトークンを消す
      return fromUrl;
    }
    return sessionStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return new URLSearchParams(location.search).get("t") ?? "";
  }
}

export class WsBackend implements Backend {
  private token = findToken();
  private ws: WebSocket | null = null;
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: never) => void; reject: (e: Error) => void }>();
  private events = new Set<(ev: ServerEvent) => void>();
  private statuses = new Set<(c: boolean) => void>();
  private opened: Promise<void> | null = null;
  private retry = 0;

  constructor() {
    this.connect();
  }

  private connect(): void {
    const url = `ws://${location.host}/ws?t=${encodeURIComponent(this.token)}`;
    const ws = new WebSocket(url);
    this.ws = ws;
    this.opened = new Promise<void>((resolve) => {
      ws.onopen = () => {
        this.retry = 0;
        this.statuses.forEach((cb) => cb(true));
        resolve();
      };
    });
    ws.onmessage = (m) => {
      const msg = JSON.parse(String(m.data)) as Response | ServerEvent;
      if ("event" in msg) return this.events.forEach((cb) => cb(msg));
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      if ("error" in msg) p.reject(new BackendError(msg.error.code, msg.error.message));
      else p.resolve(msg.result as never);
    };
    ws.onclose = () => {
      this.statuses.forEach((cb) => cb(false));
      for (const p of this.pending.values()) p.reject(new BackendError("disconnected", "接続が切れました"));
      this.pending.clear();
      setTimeout(() => this.connect(), Math.min(5000, 500 * 2 ** this.retry++));
    };
  }

  async call<M extends Method>(method: M, params: MethodMap[M]["params"]): Promise<MethodMap[M]["result"]> {
    await this.opened;
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) throw new BackendError("disconnected", "接続が切れました");
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: never) => void, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  onEvent(cb: (ev: ServerEvent) => void): () => void {
    this.events.add(cb);
    return () => this.events.delete(cb);
  }
  onStatus(cb: (connected: boolean) => void): () => void {
    this.statuses.add(cb);
    return () => this.statuses.delete(cb);
  }
  fileUrl(path: string): string {
    return fileUrl(path, this.token);
  }
}
