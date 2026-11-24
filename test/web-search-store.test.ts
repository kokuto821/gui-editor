import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_OPTS } from "../src/shared/match";
import type { TextHit } from "../src/shared/protocol";
import { BackendError } from "../src/web/backend/types";
import { IDLE, useSearch, visibleHits } from "../src/web/stores/search";

// サーバーとの窓口だけを差し替える。要求は calls に積み、応答はテストが好きな順に返す
interface Pending {
  method: string;
  params: Record<string, unknown>;
  resolve(v: unknown): void;
  reject(e: unknown): void;
}
const calls: Pending[] = vi.hoisted(() => []);
vi.mock("../src/web/backend", () => ({
  backend: {
    call: (method: string, params: Record<string, unknown>) =>
      new Promise((resolve, reject) => calls.push({ method, params, resolve, reject })),
  },
}));

const hit = (path: string, line: number): TextHit => ({ path, line, text: "foo", from: 0, to: 3 });
const result = (root: string) => useSearch.getState().text[root]?.result;
/** 応答の Promise の続きを流す */
const flush = () => vi.advanceTimersByTimeAsync(0);

let root: string;
let n = 0;
beforeEach(() => {
  vi.useFakeTimers();
  calls.length = 0;
  root = `/p${++n}`; // 検索の番号はプロジェクトごとなので、テストごとに別のプロジェクトにする
  useSearch.setState({ text: {}, quick: null, find: null, opts: DEFAULT_OPTS });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("本文検索", () => {
  it("打ち終わってから 150ms 待って、最後の言葉だけを1回送る", async () => {
    useSearch.getState().setQuery(root, "f");
    await vi.advanceTimersByTimeAsync(100);
    useSearch.getState().setQuery(root, "fo");
    await vi.advanceTimersByTimeAsync(149);
    expect(calls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls.map((c) => [c.method, c.params])).toEqual([["search.text", { root, query: "fo", opts: DEFAULT_OPTS }]]);
  });
  it("応答が届いたら、その言葉の結果として出す", async () => {
    useSearch.getState().setQuery(root, "foo");
    await vi.advanceTimersByTimeAsync(150);
    calls[0]!.resolve({ hits: [hit("a.txt", 1)], truncated: false });
    await flush();
    expect(result(root)).toMatchObject({ kind: "done", q: "foo", hits: [hit("a.txt", 1)], truncated: false });
  });
  it("前の言葉の応答が後から届いても、新しい言葉の結果を上書きしない", async () => {
    useSearch.getState().setQuery(root, "a");
    await vi.advanceTimersByTimeAsync(150);
    useSearch.getState().setQuery(root, "ab");
    await vi.advanceTimersByTimeAsync(150);
    calls[1]!.resolve({ hits: [hit("ab.txt", 1)], truncated: false });
    await flush();
    calls[0]!.resolve({ hits: [hit("a.txt", 1)], truncated: false });
    await flush();
    expect(result(root)).toMatchObject({ kind: "done", q: "ab", hits: [hit("ab.txt", 1)] });
  });
  it("言葉を消したら、走っている検索の応答は捨てる", async () => {
    useSearch.getState().setQuery(root, "foo");
    await vi.advanceTimersByTimeAsync(150);
    useSearch.getState().setQuery(root, "");
    calls[0]!.resolve({ hits: [hit("a.txt", 1)], truncated: false });
    await flush();
    expect(result(root)).toEqual({ kind: "idle" });
  });
  it("新しい結果が届くまで、前の結果を出しておく", async () => {
    useSearch.getState().setQuery(root, "foo");
    await vi.advanceTimersByTimeAsync(150);
    calls[0]!.resolve({ hits: [hit("a.txt", 1)], truncated: false });
    await flush();
    useSearch.getState().setQuery(root, "food");
    expect(result(root)).toMatchObject({ kind: "done", q: "foo" });
    expect(useSearch.getState().text[root]!.q).toBe("food");
  });
  it("前の結果がなければ、待っている間は pending", () => {
    useSearch.getState().setQuery(root, "foo");
    expect(result(root)).toEqual({ kind: "pending", q: "foo" });
  });
  it("サーバーに断られたら、その理由を出す", async () => {
    useSearch.getState().setQuery(root, "(");
    await vi.advanceTimersByTimeAsync(150);
    calls[0]!.reject(new BackendError("bad_request", "正規表現が正しくありません"));
    await flush();
    expect(result(root)).toEqual({ kind: "error", q: "(", message: "正規表現が正しくありません" });
  });
  it("それ以外の失敗は「検索できませんでした」", async () => {
    useSearch.getState().setQuery(root, "foo");
    await vi.advanceTimersByTimeAsync(150);
    calls[0]!.reject(new Error("boom"));
    await flush();
    expect(result(root)).toMatchObject({ kind: "error", message: "検索できませんでした" });
  });
  it("条件を変えたら、言葉の入っている検索を新しい条件でやり直す", async () => {
    useSearch.getState().setQuery(root, "foo");
    await vi.advanceTimersByTimeAsync(150);
    const opts = { caseSensitive: true, wholeWord: false, regexp: false };
    useSearch.getState().setOpts(opts);
    await vi.advanceTimersByTimeAsync(150);
    expect(calls.map((c) => c.params)).toEqual([
      { root, query: "foo", opts: DEFAULT_OPTS },
      { root, query: "foo", opts },
    ]);
  });
  it("結果を選ぶと、絶対パスと行と、そのファイルの中で何番目かを返す", async () => {
    useSearch.getState().setQuery(root, "foo");
    await vi.advanceTimersByTimeAsync(150);
    calls[0]!.resolve({ hits: [hit("a.txt", 1), hit("b/c.md", 3), hit("b/c.md", 7)], truncated: false });
    await flush();
    const sel = useSearch.getState().select(root, 2)!;
    expect(sel).toMatchObject({ i: 2, path: `${root}/b/c.md`, line: 7, n: 1 });
    expect("xFOOx".match(sel.re!)?.[0]).toBe("FOO"); // 検索したときの条件（大文字小文字を区別しない）
  });
});

describe("visibleHits", () => {
  it("畳んだファイルの結果を除いた添字を、上から順に返す", () => {
    const hits = [hit("a.txt", 1), hit("b.txt", 1), hit("b.txt", 2), hit("c.txt", 1)];
    const st = { q: "foo", collapsed: { "b.txt": true as const }, result: { kind: "done" as const, q: "foo", opts: DEFAULT_OPTS, hits, truncated: false, sel: null } };
    expect(visibleHits(st)).toEqual([0, 3]);
  });
  it("結果がまだなければ空", () => {
    expect(visibleHits(IDLE)).toEqual([]);
    expect(visibleHits(undefined)).toEqual([]);
  });
});

describe("クイックオープン", () => {
  it("一覧が届いたら ready にする", async () => {
    void useSearch.getState().openQuick(root);
    expect(useSearch.getState().quick).toEqual({ kind: "loading", root });
    calls[0]!.resolve({ files: ["a.txt"], truncated: false });
    await flush();
    expect(useSearch.getState().quick).toEqual({ kind: "ready", root, files: ["a.txt"], truncated: false });
  });
  it("閉じた後に一覧が届いても、開き直さない", async () => {
    void useSearch.getState().openQuick(root);
    useSearch.getState().closeQuick();
    calls[0]!.resolve({ files: ["a.txt"], truncated: false });
    await flush();
    expect(useSearch.getState().quick).toBeNull();
  });
  it("別のプロジェクトで開き直したら、前の一覧の応答は捨てる", async () => {
    void useSearch.getState().openQuick("/old");
    void useSearch.getState().openQuick(root);
    calls[1]!.resolve({ files: ["new.txt"], truncated: false });
    await flush();
    calls[0]!.resolve({ files: ["old.txt"], truncated: false });
    await flush();
    expect(useSearch.getState().quick).toEqual({ kind: "ready", root, files: ["new.txt"], truncated: false });
  });
});

describe("ページ内検索", () => {
  it("閉じて開き直すと、前の言葉が入っている", () => {
    useSearch.getState().openFind();
    useSearch.getState().setFindQuery("abc");
    useSearch.getState().closeFind();
    expect(useSearch.getState().find).toBeNull();
    useSearch.getState().openFind();
    expect(useSearch.getState().find?.q).toBe("abc");
  });
  it("言葉を渡して開くと、その言葉にする", () => {
    useSearch.getState().openFind("xyz");
    expect(useSearch.getState().find?.q).toBe("xyz");
  });
});
