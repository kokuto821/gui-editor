import { create } from "zustand";
import { DEFAULT_OPTS, type SearchOpts, buildMatcher } from "../../shared/match";
import type { TextHit } from "../../shared/protocol";
import { backend } from "../backend";
import { BackendError } from "../backend/types";
import { joinPath } from "../paths";

/** 結果を開いたときに、プレビューが移る先。開くたびに新しいオブジェクトにする（同じ結果を選び直しても、また移る） */
export interface Reveal {
  /** 結果（hits）の添字 */
  i: number;
  /** 絶対パス */
  path: string;
  line: number;
  /** 一致に印を付けるための、検索したときの言葉と条件 */
  re: RegExp | null;
  /** そのファイルの中で何番目の結果か（MD の整形表示では、ソースの行と対応しないので、この順番で寄せる） */
  n: number;
}

/** 本文検索の結果。q と opts は、その結果を出したときの言葉と条件（入力欄やボタンの今の状態とずれることがある） */
export type TextResult =
  | { kind: "idle" }
  | { kind: "pending"; q: string }
  | { kind: "done"; q: string; opts: SearchOpts; hits: TextHit[]; truncated: boolean; sel: Reveal | null }
  | { kind: "error"; q: string; message: string };

export interface TextSearch {
  q: string;
  result: TextResult;
  /** 畳んだファイル（相対パス） */
  collapsed: Record<string, true>;
}

export type QuickOpen =
  | { kind: "loading"; root: string }
  | { kind: "ready"; root: string; files: string[]; truncated: boolean }
  | { kind: "error"; root: string; message: string };

interface SearchState {
  /** プロジェクトのフォルダ → 本文検索 */
  text: Record<string, TextSearch>;
  /** 入力欄へフォーカスする要求。増えるたびに、検索の一覧が入力欄へフォーカスする */
  focusText: number;
  quick: QuickOpen | null;
  /** MD の整形表示のページ内検索。focus は、増えるたびに入力欄へフォーカスする */
  find: { q: string; focus: number } | null;
  /** 大文字小文字・単語単位・正規表現。本文検索・クイックオープン・ページ内検索で共通 */
  opts: SearchOpts;

  setQuery(root: string, q: string): void;
  toggleCollapsed(root: string, path: string): void;
  select(root: string, i: number): Reveal | null;
  focusInput(): void;
  openQuick(root: string): Promise<void>;
  closeQuick(): void;
  openFind(q?: string): void;
  setFindQuery(q: string): void;
  closeFind(): void;
  setOpts(opts: SearchOpts): void;
}

export const IDLE: TextSearch = { q: "", result: { kind: "idle" }, collapsed: {} };

/** 畳んでいないファイルの結果の添字を、上から順に並べたもの（↑↓ の移動に使う） */
export function visibleHits(st: TextSearch | undefined): number[] {
  const r = st?.result;
  if (r?.kind !== "done") return [];
  return r.hits.flatMap((h, i) => (st!.collapsed[h.path] ? [] : [i]));
}

const DEBOUNCE = 150;
// 古い応答で画面を上書きしないための番号（プロジェクトごと）
const seqs = new Map<string, number>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
let quickSeq = 0;
let lastFind = "";

export const useSearch = create<SearchState>()((set, get) => {
  const patchText = (root: string, fn: (t: TextSearch) => TextSearch) =>
    set((s) => ({ text: { ...s.text, [root]: fn(s.text[root] ?? IDLE) } }));

  async function run(root: string, q: string) {
    const my = (seqs.get(root) ?? 0) + 1;
    seqs.set(root, my);
    const opts = get().opts;
    try {
      const { hits, truncated } = await backend.call("search.text", { root, query: q, opts });
      if (seqs.get(root) === my) patchText(root, (t) => ({ ...t, result: { kind: "done", q, opts, hits, truncated, sel: null } }));
    } catch (e) {
      if (seqs.get(root) === my) patchText(root, (t) => ({ ...t, result: { kind: "error", q, message: e instanceof BackendError ? e.message : "検索できませんでした" } }));
    }
  }

  return {
    text: {},
    focusText: 0,
    quick: null,
    find: null,
    opts: DEFAULT_OPTS,

    setQuery(root, q) {
      clearTimeout(timers.get(root));
      if (!q.trim()) {
        seqs.set(root, (seqs.get(root) ?? 0) + 1); // 走っている検索の応答は捨てる
        return patchText(root, (t) => ({ ...t, q, result: { kind: "idle" } }));
      }
      // 前の結果があれば、新しい結果が届くまで出しておく（入力のたびに一覧がちらつかないように）
      patchText(root, (t) => ({ ...t, q, result: t.result.kind === "done" ? t.result : { kind: "pending", q } }));
      timers.set(root, setTimeout(() => void run(root, q), DEBOUNCE));
    },

    toggleCollapsed(root, path) {
      patchText(root, (t) => {
        const collapsed = { ...t.collapsed };
        if (collapsed[path]) delete collapsed[path];
        else collapsed[path] = true;
        return { ...t, collapsed };
      });
    },

    select(root, i) {
      const r = get().text[root]?.result;
      const hit = r?.kind === "done" ? r.hits[i] : undefined;
      if (r?.kind !== "done" || !hit) return null;
      let n = 0;
      while (r.hits[i - n - 1]?.path === hit.path) n++;
      const m = buildMatcher(r.q, r.opts);
      const sel: Reveal = { i, path: joinPath(root, hit.path), line: hit.line, re: m.ok ? m.re : null, n };
      patchText(root, (t) => ({ ...t, result: { ...r, sel } }));
      return sel;
    },

    focusInput: () => set({ focusText: get().focusText + 1 }),

    async openQuick(root) {
      const my = ++quickSeq;
      set({ quick: { kind: "loading", root } });
      try {
        const { files, truncated } = await backend.call("search.files", { root });
        if (my === quickSeq) set({ quick: { kind: "ready", root, files, truncated } });
      } catch (e) {
        if (my === quickSeq) set({ quick: { kind: "error", root, message: e instanceof BackendError ? e.message : "ファイルの一覧を読み込めませんでした" } });
      }
    },

    closeQuick() {
      quickSeq++;
      set({ quick: null });
    },

    openFind(q) {
      const f = get().find;
      set({ find: { q: q ?? f?.q ?? lastFind, focus: (f?.focus ?? 0) + 1 } });
    },

    setFindQuery(q) {
      const f = get().find;
      if (f) set({ find: { ...f, q } });
    },

    closeFind() {
      const f = get().find;
      if (!f) return;
      lastFind = f.q;
      set({ find: null });
    },

    setOpts(opts) {
      set({ opts });
      // 条件が替わったら、言葉の入っている本文検索をやり直す
      for (const [root, t] of Object.entries(get().text)) if (t.q.trim()) get().setQuery(root, t.q);
    },
  };
});
