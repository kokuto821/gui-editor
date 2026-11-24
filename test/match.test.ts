import { describe, expect, it } from "vitest";
import { DEFAULT_OPTS, type SearchOpts, buildMatcher, matchesIn } from "../src/shared/match";

/** s の中で query に一致した文字列を、前から順に */
function found(query: string, s: string, opts: Partial<SearchOpts> = {}): string[] {
  const m = buildMatcher(query, { ...DEFAULT_OPTS, ...opts });
  if (!m.ok) throw new Error("buildMatcher failed");
  return [...matchesIn(m.re, s)].map(({ from, to }) => s.slice(from, to));
}

describe("buildMatcher / matchesIn", () => {
  it("既定では、大文字小文字を区別しない部分一致", () => {
    expect(found("foo", "Foo xFOOx foo")).toEqual(["Foo", "FOO", "foo"]);
  });
  it("大文字小文字を区別すると、同じ形だけに一致する", () => {
    expect(found("foo", "Foo xFOOx foo", { caseSensitive: true })).toEqual(["foo"]);
  });
  it("一致の位置を、前から順に [開始, 終了) で返す", () => {
    const m = buildMatcher("ab", DEFAULT_OPTS);
    if (!m.ok) throw new Error("buildMatcher failed");
    expect([...matchesIn(m.re, "ab-ab")]).toEqual([{ from: 0, to: 2 }, { from: 3, to: 5 }]);
  });
  it("単語単位では、英数字と _ に挟まれたところに一致しない", () => {
    expect(found("foo", "foo foobar xfoo _foo foo_ foo1 (foo) foo", { wholeWord: true })).toEqual(["foo", "foo", "foo"]);
  });
  it("単語単位では、日本語の文字に挟まれたところにも一致しない", () => {
    expect(found("検索", "本文検索する", { wholeWord: true })).toEqual([]);
    expect(found("検索", "「検索」と 検索 。", { wholeWord: true })).toEqual(["検索", "検索"]);
  });
  it("正規表現を切ると、記号は文字どおりに探す", () => {
    expect(found("a.c", "abc a.c")).toEqual(["a.c"]);
    expect(found("(x)[y]*+?^${}|\\", "-(x)[y]*+?^${}|\\-")).toEqual(["(x)[y]*+?^${}|\\"]);
  });
  it("正規表現を入れると、パターンとして探す", () => {
    expect(found("a.c", "abc a.c", { regexp: true })).toEqual(["abc", "a.c"]);
  });
  it("正規表現と単語単位を合わせると、パターン全体を1語として扱う", () => {
    expect(found("fo+|bar", "fooo foox bar xbar", { regexp: true, wholeWord: true })).toEqual(["fooo", "bar"]);
  });
  it("正しくない正規表現は ok: false", () => {
    expect(buildMatcher("(", { ...DEFAULT_OPTS, regexp: true })).toEqual({ ok: false });
  });
  it("正規表現を切っていれば、括弧だけでも探せる", () => {
    expect(found("(", "f(x)")).toEqual(["("]);
  });
  it("長さ0の一致は返さない", () => {
    expect(found("a*", "baab", { regexp: true })).toEqual(["aa"]);
    expect(found("^", "abc", { regexp: true })).toEqual([]);
  });
});
