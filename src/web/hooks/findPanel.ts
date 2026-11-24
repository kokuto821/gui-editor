import { SearchQuery, closeSearchPanel, findNext, findPrevious, getSearchQuery, selectMatches, setSearchQuery } from "@codemirror/search";
import { type EditorView, type Panel, type ViewUpdate, runScopeHandlers } from "@codemirror/view";
import type { SearchOpts } from "../../shared/match";

// 画面のほかの検索（MD の整形表示）と同じ線のアイコン
const icon = (d: string) => `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="${d}"/></svg>`;
const ICON = {
  prev: icon("M4 10l4-4 4 4"),
  next: icon("M4 6l4 4 4-4"),
  all: icon("M3 4h10M3 8h10M3 12h10"),
  close: icon("M4.5 4.5l7 7M11.5 4.5l-7 7"),
};

// 大文字小文字・正規表現・単語単位は、VSCode と同じ記号で示す。画面のほかの検索のバー（SearchBar.tsx）も同じものを使う
export const FLAGS: { key: keyof SearchOpts; glyph: string; label: string }[] = [
  { key: "caseSensitive", glyph: "Aa", label: "大文字小文字を区別" },
  { key: "wholeWord", glyph: "ab", label: "単語単位" },
  { key: "regexp", glyph: ".*", label: "正規表現" },
];

function button(cls: string, label: string, html: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = `cm-find-btn ${cls}`;
  b.title = label;
  b.setAttribute("aria-label", label);
  b.innerHTML = html;
  b.addEventListener("mousedown", (e) => e.preventDefault()); // 入力欄のフォーカスを奪わない
  b.addEventListener("click", onClick);
  return b;
}

/** Ctrl+F の検索パネル。置換は使わない。ボタンは文字ではなくアイコンで出す。 */
export function createFindPanel(view: EditorView): Panel {
  let query = getSearchQuery(view.state);
  const dom = document.createElement("div");
  dom.className = "cm-find";

  const input = document.createElement("input");
  input.className = "cm-find-input";
  input.placeholder = "検索";
  input.spellcheck = false;
  input.setAttribute("aria-label", "検索");
  input.setAttribute("main-field", "true"); // 開き直したとき、CodeMirror がここへフォーカスする
  input.value = query.search;

  const commit = () => {
    const next = new SearchQuery({
      search: input.value,
      caseSensitive: flags.caseSensitive.getAttribute("aria-pressed") === "true",
      regexp: flags.regexp.getAttribute("aria-pressed") === "true",
      wholeWord: flags.wholeWord.getAttribute("aria-pressed") === "true",
      literal: query.literal,
      replace: query.replace,
    });
    if (next.eq(query)) return;
    query = next;
    view.dispatch({ effects: setSearchQuery.of(next) });
  };

  const flags = {} as Record<keyof SearchOpts, HTMLButtonElement>;
  for (const f of FLAGS) {
    const b = button("cm-find-flag", f.label, `<span>${f.glyph}</span>`, () => {
      b.setAttribute("aria-pressed", String(b.getAttribute("aria-pressed") !== "true"));
      commit();
    });
    b.setAttribute("aria-pressed", String(query[f.key]));
    flags[f.key] = b;
  }

  input.addEventListener("input", commit);
  dom.addEventListener("keydown", (e) => {
    if (e.isComposing) return;
    // Enter / Shift+Enter / Esc などは、CodeMirror のキー割り当て（search-panel）に任せる
    if (runScopeHandlers(view, e, "search-panel")) e.preventDefault();
  });

  dom.append(
    input,
    button("", "前へ（Shift+Enter）", ICON.prev, () => findPrevious(view)),
    button("", "次へ（Enter）", ICON.next, () => findNext(view)),
    button("", "すべて選択", ICON.all, () => selectMatches(view)),
    flags.caseSensitive,
    flags.wholeWord,
    flags.regexp,
    button("cm-find-close", "閉じる（Esc）", ICON.close, () => closeSearchPanel(view)),
  );

  return {
    dom,
    top: true,
    mount: () => input.select(),
    update(u: ViewUpdate) {
      // 別の操作（検索の開き直しなど）で検索の中身が替わったら、表示を合わせる
      for (const tr of u.transactions)
        for (const e of tr.effects)
          if (e.is(setSearchQuery) && !e.value.eq(query)) {
            query = e.value;
            input.value = query.search;
            for (const f of FLAGS) flags[f.key].setAttribute("aria-pressed", String(query[f.key]));
          }
    },
  };
}
