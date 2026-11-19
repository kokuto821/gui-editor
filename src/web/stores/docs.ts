import { create } from "zustand";
import type { ReadResult } from "../../shared/protocol";
import { backend } from "../backend";
import { BackendError } from "../backend/types";
import { isInside } from "../paths";

/** 開いたテキストファイル。saved は最後に読んだ / 保存した中身、text は編集中の中身。 */
export interface Doc {
  path: string;
  saved: string;
  text: string;
  mtime: number;
  /** 外で書き換えられた。編集中の中身は残したまま、選んでもらう */
  conflict: { text: string; mtime: number } | null;
}

interface DocsState {
  docs: Record<string, Doc>;
  /** テキスト以外（画像・表示に対応していないもの）と、読めなかったもの */
  others: Record<string, ReadResult | { kind: "error"; message: string }>;
  load(path: string): Promise<void>;
  edit(path: string, text: string): void;
  save(path: string): Promise<"ok" | "conflict" | "forbidden" | "error">;
  /** 衝突したとき: 外の内容に替える（編集は捨てる） */
  takeRemote(path: string): void;
  /** 衝突したとき: 編集を続ける（保存すると外の変更を上書きする） */
  keepMine(path: string): void;
  discard(path: string): void;
  toggleCheckbox(path: string, line: number): Promise<void>;
  onChanged(paths: string[]): Promise<void>;
  moved(from: string, to: string | null): void;
}

export const isDirty = (d: Doc | undefined) => !!d && d.text !== d.saved;
const MAX_CACHE = 60;

export const useDocs = create<DocsState>()((set, get) => {
  const put = (d: Doc) => set((s) => ({ docs: { ...s.docs, [d.path]: d } }));

  /** 古い、編集していないものを捨てる（開いたファイルが増え続けないように） */
  function trim() {
    const { docs } = get();
    const keys = Object.keys(docs);
    if (keys.length <= MAX_CACHE) return;
    const next = { ...docs };
    for (const k of keys) {
      if (Object.keys(next).length <= MAX_CACHE) break;
      if (!isDirty(next[k])) delete next[k];
    }
    set({ docs: next });
  }

  async function read(path: string) {
    try {
      return await backend.call("fs.read", { path });
    } catch (e) {
      return { kind: "error" as const, message: e instanceof BackendError ? e.message : "読み込めませんでした" };
    }
  }

  function apply(path: string, r: Awaited<ReturnType<typeof read>>) {
    if (r.kind === "text") {
      const cur = get().docs[path];
      if (!cur) put({ path, saved: r.text, text: r.text, mtime: r.mtime, conflict: null });
      else if (cur.mtime !== r.mtime || cur.saved !== r.text) {
        if (!isDirty(cur)) put({ path, saved: r.text, text: r.text, mtime: r.mtime, conflict: null });
        else if (cur.saved !== r.text) put({ ...cur, conflict: { text: r.text, mtime: r.mtime } });
        else put({ ...cur, mtime: r.mtime }); // 中身は同じで、時刻だけ違う（自分の保存など）
      }
      if (get().others[path]) set((s) => { const o = { ...s.others }; delete o[path]; return { others: o }; });
    } else {
      set((s) => ({ others: { ...s.others, [path]: r } }));
      if (get().docs[path] && !isDirty(get().docs[path])) set((s) => { const d = { ...s.docs }; delete d[path]; return { docs: d }; });
    }
  }

  return {
    docs: {},
    others: {},

    async load(path) {
      apply(path, await read(path));
      trim();
    },

    edit(path, text) {
      const d = get().docs[path];
      if (d && d.text !== text) put({ ...d, text });
    },

    async save(path) {
      const d = get().docs[path];
      if (!d) return "error";
      const text = d.text;
      try {
        const { mtime } = await backend.call("fs.write", { path, text, baseMtime: d.mtime });
        const now = get().docs[path] ?? d;
        // 保存している間に、さらに編集されていたら、その編集は残す
        put({ ...now, saved: text, mtime, conflict: null });
        return "ok";
      } catch (e) {
        if (e instanceof BackendError && e.code === "conflict") {
          const r = await read(path);
          if (r.kind === "text") put({ ...(get().docs[path] ?? d), conflict: { text: r.text, mtime: r.mtime } });
          return "conflict";
        }
        return e instanceof BackendError && e.code === "forbidden" ? "forbidden" : "error";
      }
    },

    takeRemote(path) {
      const d = get().docs[path];
      if (d?.conflict) put({ path, saved: d.conflict.text, text: d.conflict.text, mtime: d.conflict.mtime, conflict: null });
    },

    keepMine(path) {
      const d = get().docs[path];
      if (d?.conflict) put({ ...d, mtime: d.conflict.mtime, saved: d.conflict.text, conflict: null });
    },

    discard(path) {
      const d = get().docs[path];
      if (d) put({ ...d, text: d.saved, conflict: null });
    },

    /** MD のチェックボックス: 未保存の編集がなければそのまま保存し、あれば編集に加えるだけにする。 */
    async toggleCheckbox(path, line) {
      const d = get().docs[path];
      if (!d) return;
      const L = d.text.split("\n");
      const cur = L[line];
      if (cur === undefined) return;
      L[line] = /\[x\]/i.test(cur) ? cur.replace(/\[x\]/i, "[ ]") : cur.replace("[ ]", "[x]");
      const clean = !isDirty(d);
      put({ ...d, text: L.join("\n") });
      if (clean) await get().save(path);
    },

    async onChanged(paths) {
      const { docs, others } = get();
      const known = new Set([...Object.keys(docs), ...Object.keys(others)]);
      const hit = [...known].filter((k) => paths.some((p) => p === k));
      await Promise.all(hit.map(async (k) => apply(k, await read(k))));
    },

    /** 名前変更・削除（to が null）に合わせて、キャッシュのパスを直す。 */
    moved(from, to) {
      const fix = (k: string) => (k === from ? to : isInside(from, k) ? (to === null ? null : to + k.slice(from.length)) : k);
      const docs: Record<string, Doc> = {};
      for (const [k, d] of Object.entries(get().docs)) {
        const nk = fix(k);
        if (nk) docs[nk] = { ...d, path: nk };
      }
      const others: DocsState["others"] = {};
      for (const [k, v] of Object.entries(get().others)) {
        const nk = fix(k);
        if (nk) others[nk] = v;
      }
      set({ docs, others });
    },
  };
});

/** 未保存の編集があるファイル */
export const dirtyPaths = (docs: Record<string, Doc>) => Object.values(docs).filter(isDirty).map((d) => d.path);
