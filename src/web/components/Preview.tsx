import { useEffect, useMemo, useRef } from "react";
import { backend } from "../backend";
import { useCodeMirror } from "../hooks/useCodeMirror";
import { renderMermaidIn } from "../lib/mermaid";
import { renderMd } from "../md";
import { baseOf, dirOf, extOf, fmtSize, resolvePath, tilde } from "../paths";
import { isImagePath, shownOf, useApp, useProject } from "../stores/app";
import { type Doc, useDocs } from "../stores/docs";
import "../md.css";

function Message({ title, meta }: { title: string; meta?: string }) {
  return (
    <div className="grid h-full place-content-center justify-items-center gap-1.5 p-5 text-center text-mute">
      <b className="font-medium text-ink">{title}</b>
      {meta && <span className="font-mono text-xs">{meta}</span>}
    </div>
  );
}

/** 外で書き換えられたとき: 上書きせず、選んでもらう */
function ConflictBar({ doc }: { doc: Doc }) {
  const takeRemote = useDocs((s) => s.takeRemote);
  const keepMine = useDocs((s) => s.keepMine);
  if (!doc.conflict) return null;
  return (
    <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-del-bg px-4 py-2">
      <span className="min-w-0 flex-1">このファイルは外で書き換えられました。編集中の内容と食い違っています。</span>
      <button type="button" className="rounded-md border border-line bg-bg px-2.5 py-0.5 hover:bg-soft" onClick={() => takeRemote(doc.path)}>外の内容を読み込む（編集は破棄）</button>
      <button type="button" className="rounded-md border border-line bg-bg px-2.5 py-0.5 hover:bg-soft" onClick={() => keepMine(doc.path)}>編集を続ける（保存すると上書き）</button>
    </div>
  );
}

function Markdown({ doc, root }: { doc: Doc; root: string }) {
  const ref = useRef<HTMLElement>(null);
  const html = useMemo(() => renderMd(doc.text, doc.path, root, (abs) => backend.fileUrl(abs)), [doc.text, doc.path, root]);
  const navigateTo = useApp((s) => s.navigateTo);
  const toggleCheckbox = useDocs((s) => s.toggleCheckbox);

  useEffect(() => {
    if (ref.current) void renderMermaidIn(ref.current);
  }, [html]);
  // ダークモードの切替で、図を描き直す
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => {
      ref.current?.querySelectorAll(".mmd").forEach((el) => {
        const e = el as HTMLElement;
        if (!e.dataset.src) e.innerHTML = "";
      });
      if (ref.current) void renderMermaidIn(ref.current);
    };
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const onClick = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement;
    if (t instanceof HTMLInputElement && t.type === "checkbox" && t.dataset.line !== undefined) {
      void toggleCheckbox(doc.path, Number(t.dataset.line));
      return;
    }
    const a = t.closest("a");
    if (!a) return;
    e.preventDefault(); // リンクを押しても、画面から離れない
    const goto = a.dataset.goto;
    const href = a.getAttribute("href") ?? "";
    if (goto) void navigateTo(goto);
    else if (/^https?:\/\//i.test(href)) window.open(href, "_blank", "noopener,noreferrer");
    else if (href && !href.startsWith("#")) {
      const abs = resolvePath(dirOf(doc.path), decodeURI(href.split("#")[0] ?? ""));
      if (abs) void navigateTo(abs);
    }
  };
  return <article ref={ref} className="md" onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />;
}

function MermaidFile({ doc }: { doc: Doc }) {
  const ref = useRef<HTMLDivElement>(null);
  const html = useMemo(() => `<div class="mmd" data-src="${doc.text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")}">図を描いています…</div>`, [doc.text]);
  useEffect(() => {
    if (ref.current) void renderMermaidIn(ref.current);
  }, [html]);
  return <div ref={ref} className="md" dangerouslySetInnerHTML={{ __html: html }} />;
}

/** 図解（HTML）: スクリプトなしのサンドボックス。相対パスの CSS や画像は、別のオリジンから読む */
function HtmlView({ doc }: { doc: Doc }) {
  const srcDoc = useMemo(() => {
    const base = `<base href="${backend.previewBase(dirOf(doc.path))}">`;
    return /<head[^>]*>/i.test(doc.text) ? doc.text.replace(/<head[^>]*>/i, (m) => m + base) : base + doc.text;
  }, [doc.text, doc.path]);
  return <iframe title={`${baseOf(doc.path)}のプレビュー`} sandbox="" srcDoc={srcDoc} className="size-full border-0 bg-white" />;
}

function CodeView({ doc, editable }: { doc: Doc; editable: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useCodeMirror(ref, {
    text: doc.text,
    filename: baseOf(doc.path),
    editable,
    wrap: editable && /\.(md|markdown|txt)$/i.test(doc.path),
    autoFocus: editable,
    onChange: (text) => useDocs.getState().edit(doc.path, text),
  });
  return <div ref={ref} className="h-full" />;
}

export function Preview() {
  const p = useProject();
  const entries = useApp((s) => s.entries);
  const home = useApp((s) => s.home);
  const setPane = useApp((s) => s.setPane);
  const docs = useDocs((s) => s.docs);
  const others = useDocs((s) => s.others);
  const c = shownOf(p, entries);

  let body: React.ReactNode;
  let scrolls = true; // CodeMirror は、自分でスクロールする
  let doc: Doc | undefined;
  if (!p || !c || !p.tabs.length) body = <Message title="ファイルがありません" />;
  else if (isImagePath(c.path))
    body = (
      <div className="grid h-full place-items-center overflow-auto p-5">
        <img src={backend.fileUrl(c.path)} alt={c.name} className="max-h-full max-w-full object-contain shadow-[0_0_0_1px_var(--color-line)]" />
      </div>
    );
  else {
    doc = docs[c.path];
    const other = others[c.path];
    const mode = p.mode[c.path] ?? "view";
    const ext = extOf(c.name);
    if (doc) {
      if (mode === "edit") (body = <CodeView doc={doc} editable />, (scrolls = false));
      else if (ext === "md" || ext === "markdown") body = <Markdown doc={doc} root={p.root} />;
      else if (ext === "mmd" || ext === "mermaid") body = <MermaidFile doc={doc} />;
      else if (ext === "html" || ext === "htm") (body = <HtmlView doc={doc} />, (scrolls = false));
      else (body = <CodeView doc={doc} editable={false} />, (scrolls = false));
    } else if (other?.kind === "unsupported")
      body = <Message title={other.reason === "large" ? "ファイルが大きすぎて表示できません" : "このファイルは表示に対応していません"} meta={`${c.name} ・ ${extOf(c.name).toUpperCase() || "—"} ・ ${fmtSize(other.size)}`} />;
    else if (other?.kind === "error") body = <Message title={other.message} meta={tilde(c.path, home)} />;
    else body = null; // 読み込み中
  }

  return (
    <div className="flex h-full min-h-0 flex-col" onMouseDown={() => setPane("preview")}>
      {doc && <ConflictBar doc={doc} />}
      <div id="preview-scroll" className={scrolls ? "min-h-0 flex-1 overflow-auto" : "min-h-0 flex-1 overflow-hidden"}>
        {body}
      </div>
    </div>
  );
}
