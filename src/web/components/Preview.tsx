import { useMemo } from "react";
import { backend } from "../backend";
import { renderMd } from "../md";
import { baseOf, dirOf, extOf, fmtSize, resolvePath, tilde } from "../paths";
import { useApp } from "../stores/app";
import "../md.css";

function Message({ title, meta }: { title: string; meta?: string }) {
  return (
    <div className="grid h-full place-content-center justify-items-center gap-1.5 p-5 text-center text-mute">
      <b className="font-medium text-ink">{title}</b>
      {meta && <span className="font-mono text-xs">{meta}</span>}
    </div>
  );
}

function Markdown({ path, text }: { path: string; text: string }) {
  const html = useMemo(() => renderMd(text, path, (abs) => backend.fileUrl(abs)), [path, text]);
  const goTo = useApp((s) => s.goTo);

  // リンクを押しても、画面から離れない
  const onClick = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest("a");
    if (!a) return;
    e.preventDefault();
    const href = a.getAttribute("href") ?? "";
    if (/^https?:\/\//i.test(href)) window.open(href, "_blank", "noopener,noreferrer");
    else if (href && !href.startsWith("#")) {
      const abs = resolvePath(dirOf(path), decodeURI(href.split("#")[0] ?? ""));
      if (abs) void goTo(abs);
    }
  };
  return <article className="md" onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />;
}

function Code({ text }: { text: string }) {
  const lines = useMemo(() => text.replace(/\n$/, "").split("\n"), [text]);
  return (
    <div className="flex gap-4 p-4 font-mono text-[12.5px] leading-[1.6]">
      <div className="flex-none text-right text-mute select-none" aria-hidden>
        {lines.map((_, i) => (
          <div key={i}>{i + 1}</div>
        ))}
      </div>
      <pre className="m-0 min-w-0 flex-1 overflow-x-auto">{lines.join("\n")}</pre>
    </div>
  );
}

export function Preview() {
  const preview = useApp((s) => s.preview);
  const setPane = useApp((s) => s.setPane);
  const home = useApp((s) => s.home);

  let body: React.ReactNode;
  if (preview.kind === "none") body = <Message title="ファイルがありません" />;
  else if (preview.kind === "error") body = <Message title={preview.message} meta={tilde(preview.path, home)} />;
  else if (preview.kind === "dir")
    body = (
      <div className="p-4 text-mute">
        {preview.entries.length === 0 ? "空のフォルダです" : preview.entries.map((e) => <div key={e.name}>{e.name}{e.kind === "dir" ? "/" : ""}</div>)}
      </div>
    );
  else {
    const { path, result } = preview;
    const name = baseOf(path);
    if (result.kind === "image")
      body = (
        <div className="grid h-full place-items-center overflow-auto p-5">
          <img src={backend.fileUrl(path)} alt={name} className="max-h-full max-w-full object-contain shadow-[0_0_0_1px_var(--color-line)]" />
        </div>
      );
    else if (result.kind === "unsupported")
      body = (
        <Message
          title={result.reason === "large" ? "ファイルが大きすぎて表示できません" : "このファイルは表示に対応していません"}
          meta={`${name} ・ ${extOf(name).toUpperCase() || "—"} ・ ${fmtSize(result.size)}`}
        />
      );
    else if (extOf(name) === "md") body = <Markdown path={path} text={result.text} />;
    else body = <Code text={result.text} />;
  }

  return (
    <div id="preview-scroll" className="h-full overflow-auto" onMouseDown={() => setPane("preview")}>
      {body}
    </div>
  );
}
