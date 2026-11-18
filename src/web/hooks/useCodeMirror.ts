import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { HighlightStyle, LanguageDescription, syntaxHighlighting } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { Annotation, Compartment, EditorState } from "@codemirror/state";
import { drawSelection, EditorView, highlightActiveLine, keymap, lineNumbers } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import { type RefObject, useEffect, useRef } from "react";

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
});

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
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
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

