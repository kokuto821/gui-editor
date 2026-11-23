import { openSearchPanel } from "@codemirror/search";
import { EditorView } from "@codemirror/view";
import { currentOf, shownOf, useApp } from "./stores/app";
import { useDocs } from "./stores/docs";
import { useGit } from "./stores/git";
import { useSearch } from "./stores/search";
import { useUi } from "./stores/ui";

const inField = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);

/** プレビューのスクロールする要素（CodeMirror のときは、その内側） */
const scroller = () => document.querySelector<HTMLElement>("#preview-scroll .cm-scroller") ?? document.getElementById("preview-scroll");

/** ページ内検索: コードは CodeMirror の検索パネル、MD の整形表示は自前の検索バー。HTML・図・画像はブラウザに任せる（奪わない） */
function findInPreview(e: KeyboardEvent) {
  const cm = document.querySelector<HTMLElement>("#preview-scroll .cm-editor");
  const view = cm && EditorView.findFromDOM(cm);
  if (view) {
    e.preventDefault();
    openSearchPanel(view);
  } else if (document.querySelector("#preview-scroll article.md")) {
    e.preventDefault();
    const sel = String(window.getSelection() ?? "");
    useSearch.getState().openFind(sel && !sel.includes("\n") ? sel : undefined);
  }
}

/** キー操作は、React の外で1回だけ登録する。一覧とプレビューのうち、最後にクリックした方だけが受ける。 */
export function installKeys(): void {
  window.addEventListener("keydown", (e) => {
    if (e.isComposing) return;
    const s = useApp.getState();
    const ui = useUi.getState();
    const se = useSearch.getState();
    if (ui.dialog || ui.menu || se.quick) return; // ダイアログ、メニュー、ファイルを開く画面は、自分でキーを受ける

    // 保存: 入力中も受ける
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.code === "KeyS") {
      e.preventDefault();
      void s.saveCurrent();
      return;
    }

    // ファイルを開く・検索・ページ内検索: 入力中も受ける（Ctrl+P はブラウザの印刷を奪う）
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.code === "KeyP" || e.code === "KeyF")) {
      const p = s.projects[s.active];
      if (e.code === "KeyP" && !e.shiftKey) {
        e.preventDefault();
        if (p) void se.openQuick(p.root);
      } else if (e.code === "KeyF" && e.shiftKey) {
        e.preventDefault();
        if (p) void s.setSide("search");
      } else if (e.code === "KeyF" && !e.defaultPrevented) findInPreview(e); // CodeMirror の中では、CodeMirror が開く
      return;
    }

    // プロジェクトの操作（Alt 系。ブラウザが Ctrl+T などを奪えないため）
    if (e.altKey && !e.ctrlKey && !e.metaKey) {
      const m = /^Digit([1-9])$/.exec(e.code);
      if (m) {
        e.preventDefault();
        void s.switchProject(Number(m[1]) - 1);
      } else if (e.code === "KeyT") {
        e.preventDefault();
        void s.newProject();
      } else if (e.code === "KeyW") {
        e.preventDefault();
        void s.closeProject(s.active);
      }
      return;
    }

    // テキスト入力中は、キーを奪わない（Esc だけ受ける）
    if (inField(e.target)) {
      // CodeMirror の検索パネルの Esc は、パネルを閉じるだけ（CodeMirror が受ける）
      if (e.key === "Escape" && (e.target as HTMLElement).closest(".cm-editor") && !(e.target as HTMLElement).closest(".cm-panels")) {
        e.preventDefault();
        const p = s.projects[s.active];
        const c = shownOf(p, s.entries);
        if (c) s.setMode(c.path, "view"); // 編集をやめて、一覧に戻る
        (document.activeElement as HTMLElement | null)?.blur();
      }
      return;
    }
    if (e.ctrlKey || e.metaKey) return;
    const p = s.projects[s.active];
    if (!p) return;

    // 差分画面
    if (p.view === "diff") {
      return diffKeys(e, s);
    }

    if (e.key === "/" && p.side === "search") return (e.preventDefault(), se.focusInput());
    if (e.key === "Escape" && se.find) return (e.preventDefault(), se.closeFind());

    // プレビューがキーを受けているとき: スクロールだけ
    if (s.pane === "preview") {
      const el = scroller();
      const page = (el?.clientHeight ?? 400) * 0.5;
      const by: Record<string, number> = { ArrowDown: 60, j: 60, ArrowUp: -60, k: -60, d: page, u: -page };
      if (el && e.key in by) return e.preventDefault(), el.scrollBy({ top: by[e.key] });
      if (el && (e.key === "g" || e.key === "Home")) return e.preventDefault(), el.scrollTo({ top: 0 });
      if (el && (e.key === "G" || e.key === "End")) return e.preventDefault(), el.scrollTo({ top: el.scrollHeight });
      if (e.key === "Escape") return s.setPane("list");
      if (e.key === "v") return void s.toggleView();
      if (e.key === "e") return (e.preventDefault(), s.toggleMode());
      return;
    }

    switch (e.key) {
      case "ArrowDown": case "j": e.preventDefault(); return void s.move(1);
      case "ArrowUp": case "k": e.preventDefault(); return void s.move(-1);
      case "ArrowRight": case "l": e.preventDefault(); return void s.enter();
      case "ArrowLeft": case "h": e.preventDefault(); return void s.up();
      case "g": case "Home": e.preventDefault(); return void s.jump(false);
      case "G": case "End": e.preventDefault(); return void s.jump(true);
      case "d": case "u": {
        const el = scroller();
        el?.scrollBy({ top: (e.key === "d" ? 1 : -1) * el.clientHeight * 0.5 });
        return;
      }
      case "Enter": case "e": {
        if (e.key === "Enter" && p.side === "search") return; // 結果は、選んだときに開いている
        const c = currentOf(p, s.entries);
        if (e.key === "Enter" && c?.isDir) return (e.preventDefault(), void s.enter());
        const f = shownOf(p, s.entries);
        if (f && useDocs.getState().docs[f.path]) (e.preventDefault(), s.toggleMode());
        return;
      }
      case "v": return void s.toggleView();
    }
  });
}

function diffKeys(e: KeyboardEvent, s: ReturnType<typeof useApp.getState>) {
  const p = s.projects[s.active];
  if (!p) return;
  const repo = useGit.getState().repos[p.root];
  const len = p.gfocus === "changes" ? (repo?.files.length ?? 0) : (repo?.commits.length ?? 0);
  const go = (i: number) => len && s.setGitIndex(Math.max(0, Math.min(len - 1, i)));
  const el = document.getElementById("preview-scroll");
  switch (e.key) {
    case "ArrowDown": case "j": e.preventDefault(); return go(p.gi[p.gfocus] + 1);
    case "ArrowUp": case "k": e.preventDefault(); return go(p.gi[p.gfocus] - 1);
    case "g": case "Home": e.preventDefault(); return go(0);
    case "G": case "End": e.preventDefault(); return go(len - 1);
    case "ArrowLeft": case "h": e.preventDefault(); return s.setGitFocus("changes");
    case "ArrowRight": case "l": e.preventDefault(); return s.setGitFocus("commits");
    case "d": case "u": return el?.scrollBy({ top: (e.key === "d" ? 1 : -1) * el.clientHeight * 0.5 });
    case "v": case "Escape": e.preventDefault(); return void s.toggleView();
  }
}
