import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { HighlightStyle, LanguageDescription, syntaxHighlighting } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { search, searchKeymap } from "@codemirror/search";
import { Annotation, Compartment, EditorState } from "@codemirror/state";
import { drawSelection, EditorView, highlightActiveLine, keymap, lineNumbers } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import { type RefObject, useEffect, useRef } from "react";
import { matchesIn } from "../../shared/match";
import { createFindPanel } from "./findPanel";

/** 外から差し替えた変更（編集としては数えない）の目印 */
const external = Annotation.define<boolean>();

// 配色は5色の CSS 変数だけを使う（色ではなく、太さ・斜体・濃さで区別する）
const theme = EditorView.theme({
  "&": { height: "100%", fontSize: "12.5px", color: "var(--color-ink)", backgroundColor: "transparent" },
  ".cm-scroller": { fontFamily: "var(--font-mono)", lineHeight: "1.6", overflow: "auto" },
  ".cm-content": { padding: "12px 0", caretColor: "var(--color-ink)" },
  ".cm-line": { padding: "0 16px 0 8px" },
  ".cm-gutters": { backgroundColor: "transparent", color: "var(--color-mute)", border: "none", paddingLeft: "8px" },
  ".cm-lineNumbers .cm-gutterElement": { padding: "0 8px 0 4px", minWidth: "28px" },
  ".cm-activeLine": { backgroundColor: "color-mix(in srgb, var(--color-soft) 35%, transparent)" },
  "&.cm-focused": { outline: "none" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": { backgroundColor: "var(--color-soft)" },
  ".cm-cursor": { borderLeftColor: "var(--color-ink)" },
  // 検索パネル（Ctrl+F）。作りは findPanel.ts
  // 既定の z-index（300）だと、クイックオープンやメニューより前に出てしまう
  ".cm-panels": { backgroundColor: "var(--color-bg)", color: "var(--color-ink)", zIndex: "2" },
  ".cm-panels.cm-panels-top": { borderBottom: "1px solid var(--color-line)" },
  ".cm-find": { display: "flex", alignItems: "center", gap: "2px", padding: "4px 8px", fontFamily: "var(--font-sans)", fontSize: "12.5px" },
  ".cm-find-input": { width: "220px", minWidth: "0", marginRight: "4px", fontSize: "12.5px", color: "var(--color-ink)", backgroundColor: "var(--color-bg)", border: "1px solid var(--color-line)", borderRadius: "4px", padding: "2px 6px", outline: "none" },
  ".cm-find-input:focus": { borderColor: "var(--color-ink)" },
  ".cm-find-btn": { display: "grid", placeItems: "center", width: "24px", height: "24px", flex: "none", border: "none", borderRadius: "4px", backgroundColor: "transparent", color: "var(--color-mute)", cursor: "pointer", font: "inherit" },
  ".cm-find-btn:hover": { backgroundColor: "var(--color-soft)", color: "var(--color-ink)" },
  ".cm-find-btn svg": { width: "14px", height: "14px", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round" },
  ".cm-find-flag": { fontFamily: "var(--font-mono)", fontSize: "11px", fontWeight: "600" },
  ".cm-find-flag[aria-pressed=true]": { backgroundColor: "var(--color-soft)", color: "var(--color-ink)" },
  ".cm-find-close": { marginLeft: "auto" },
  ".cm-searchMatch": { backgroundColor: "color-mix(in srgb, var(--color-ink) 16%, transparent)", outline: "1px solid color-mix(in srgb, var(--color-ink) 30%, transparent)", borderRadius: "2px" },
  ".cm-searchMatch.cm-searchMatch-selected, .cm-searchMatch-selected *": { backgroundColor: "var(--color-ink)", color: "var(--color-bg)" },
});

const phrases = EditorState.phrases.of({
  Find: "検索",
  "current match": "現在の一致",
  "on line": "行",
});

/** line 行目（1 始まり）を真ん中へスクロールし、その行の re の最初の一致を選ぶ（なければ行の先頭） */
export function revealLine(v: EditorView, line: number, re: RegExp | null): void {
  const ln = v.state.doc.line(Math.max(1, Math.min(line, v.state.doc.lines)));
  const m = re ? matchesIn(re, ln.text).next() : null;
  const hit = m && !m.done ? m.value : { from: 0, to: 0 };
  v.dispatch({ selection: { anchor: ln.from + hit.from, head: ln.from + hit.to }, effects: EditorView.scrollIntoView(ln.from + hit.from, { y: "center" }) });
}

const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.operatorKeyword, t.modifier, t.controlKeyword], fontWeight: "600" },
  { tag: [t.string, t.regexp, t.special(t.string)], color: "var(--color-mute)" },
  { tag: [t.comment, t.lineComment, t.blockComment], color: "var(--color-mute)", fontStyle: "italic" },
  { tag: [t.number, t.bool, t.null, t.atom], fontWeight: "500" },
  { tag: [t.definition(t.variableName), t.function(t.variableName), t.typeName, t.className, t.tagName], fontWeight: "500" },
  { tag: [t.heading, t.heading1, t.heading2, t.strong], fontWeight: "700" },
  { tag: [t.emphasis], fontStyle: "italic" },
  { tag: [t.link, t.url], textDecoration: "underline" },
  { tag: [t.meta, t.punctuation, t.bracket], color: "var(--color-mute)" },
]);

export interface CodeMirrorOpts {
  text: string;
  filename: string;
  editable: boolean;
  wrap?: boolean;
  onChange?: (text: string) => void;
  autoFocus?: boolean;
}

/** CodeMirror 6 を1つ持つ。外から text が変わったときは、編集中の位置を保ったまま差し替える。 */
export function useCodeMirror(parent: RefObject<HTMLElement | null>, o: CodeMirrorOpts) {
  const view = useRef<EditorView | null>(null);
  const onChange = useRef(o.onChange);
  onChange.current = o.onChange;
  const editableC = useRef(new Compartment());
  const langC = useRef(new Compartment());
  const wrapC = useRef(new Compartment());

  useEffect(() => {
    const el = parent.current;
    if (!el) return;
    const v = new EditorView({
      parent: el,
      state: EditorState.create({
        doc: o.text,
        extensions: [
          lineNumbers(),
          history(),
          drawSelection(),
          highlightActiveLine(),
          syntaxHighlighting(highlight),
          keymap.of([...defaultKeymap, ...searchKeymap, ...historyKeymap, indentWithTab]),
          search({ top: true, createPanel: createFindPanel }),
          phrases,
          theme,
          editableC.current.of([EditorView.editable.of(o.editable), EditorState.readOnly.of(!o.editable)]),
          langC.current.of([]),
          wrapC.current.of(o.wrap ? EditorView.lineWrapping : []),
          EditorView.updateListener.of((u) => {
            if (u.docChanged && !u.transactions.some((tr) => tr.annotation(external))) onChange.current?.(u.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = v;
    if (o.autoFocus) v.focus();
    return () => {
      v.destroy();
      view.current = null;
    };
    // 作り直すのは、ファイルが替わったときだけ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [o.filename]);

  // 外から変わった中身を反映する
  useEffect(() => {
    const v = view.current;
    if (!v || v.state.doc.toString() === o.text) return;
    const sel = v.state.selection.main;
    const len = o.text.length;
    v.dispatch({
      changes: { from: 0, to: v.state.doc.length, insert: o.text },
      selection: { anchor: Math.min(sel.anchor, len), head: Math.min(sel.head, len) },
      annotations: external.of(true),
    });
  }, [o.text]);

  useEffect(() => {
    view.current?.dispatch({
      effects: [
        editableC.current.reconfigure([EditorView.editable.of(o.editable), EditorState.readOnly.of(!o.editable)]),
        wrapC.current.reconfigure(o.wrap ? EditorView.lineWrapping : []),
      ],
    });
    if (o.editable && o.autoFocus) view.current?.focus();
  }, [o.editable, o.wrap, o.autoFocus]);

  // 言語は、必要になったものだけ読む
  useEffect(() => {
    let dead = false;
    const desc = LanguageDescription.matchFilename(languages, o.filename);
    if (!desc) return void view.current?.dispatch({ effects: langC.current.reconfigure([]) });
    void desc.load().then((support) => {
      if (!dead) view.current?.dispatch({ effects: langC.current.reconfigure(support) });
    });
    return () => {
      dead = true;
    };
  }, [o.filename]);

  return view;
}

