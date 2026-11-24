// 検索の一致の条件。本文検索（サーバー）、クイックオープン、MD のページ内検索で同じものを使う。

export interface SearchOpts {
  caseSensitive: boolean;
  wholeWord: boolean;
  regexp: boolean;
}

export const DEFAULT_OPTS: SearchOpts = { caseSensitive: false, wholeWord: false, regexp: false };

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** query を opts の条件で探す正規表現（g 付き。matchesIn で使う）。正規表現として正しくなければ ok: false */
export function buildMatcher(query: string, opts: SearchOpts): { ok: true; re: RegExp } | { ok: false } {
  let src = opts.regexp ? query : escapeRe(query);
  // \b は英数字しか見ないので、日本語の中では単語の切れ目にならない
  if (opts.wholeWord) src = `(?<![\\p{L}\\p{N}_])(?:${src})(?![\\p{L}\\p{N}_])`;
  try {
    return { ok: true, re: new RegExp(src, `g${opts.wholeWord ? "u" : ""}${opts.caseSensitive ? "" : "i"}`) };
  } catch {
    return { ok: false };
  }
}

/** s の中の一致を前から順に。長さ0の一致（a* など）は飛ばす */
export function* matchesIn(re: RegExp, s: string): Generator<{ from: number; to: number }> {
  for (const m of s.matchAll(re)) if (m[0]) yield { from: m.index, to: m.index + m[0].length };
}
