import clsx from "clsx";
import { useEffect, useRef } from "react";
import { relTime } from "../lib/time";
import { useApp, useProject } from "../stores/app";
import { useGit } from "../stores/git";

const STATUS_LABEL: Record<string, string> = { M: "M", A: "A", D: "D", R: "R", "?": "?", U: "U" };

/** 左の2つの面: Changes（作業ツリーの変更）と Commits（履歴）。読み取り専用 */
export function GitPanes() {
  const p = useProject();
  const repo = useGit((s) => (p ? s.repos[p.root] : undefined));
  const setGitFocus = useApp((s) => s.setGitFocus);
  const setGitIndex = useApp((s) => s.setGitIndex);
  const setPane = useApp((s) => s.setPane);
  const refs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (!p) return;
    refs.current[p.gfocus]?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [p?.gfocus, p?.gi.changes, p?.gi.commits]);

  if (!p) return null;
  const Panel = ({ k, title, count, children }: { k: "changes" | "commits"; title: string; count: number; children: React.ReactNode }) => (
    <section className={clsx("flex min-h-0 flex-1 flex-col border-b border-line last:border-b-0", p.gfocus === k && "bg-soft/25")} aria-label={title}>
      <h2 className={clsx("m-0 flex items-center gap-2 px-3 py-1 text-xs font-medium", p.gfocus === k ? "text-ink" : "text-mute")}>
        {title}
        <span className="font-mono text-[10px] text-mute">{count}</span>
      </h2>
      <div ref={(el) => void (refs.current[k] = el)} className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-1.5" role="listbox" onMouseDown={() => setPane("list")}>
        {children}
      </div>
    </section>
  );

  if (repo && !repo.isRepo) return <p className="m-0 px-3 py-3 text-mute">git のリポジトリではありません</p>;
  const files = repo?.files ?? [];
  const commits = repo?.commits ?? [];
  const pick = (k: "changes" | "commits", i: number) => {
    if (p.gfocus !== k) setGitFocus(k);
    setGitIndex(i); // 面を替えたあと、その面の位置を選ぶ
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Panel k="changes" title="Changes" count={files.length}>
        {!files.length && <p className="m-0 px-2 py-1 text-mute">変更はありません</p>}
        {files.map((f, i) => (
          <button key={f.path} type="button" tabIndex={-1} role="option" aria-selected={p.gfocus === "changes" && p.gi.changes === i} title={f.path} onClick={() => pick("changes", i)} className={clsx("flex w-full items-center gap-2 rounded-md px-2 py-0.5 text-left", p.gi.changes === i && (p.gfocus === "changes" ? "bg-soft" : "bg-soft/50"))}>
            <span className={clsx("w-4 flex-none text-center font-mono text-[11px]", f.status === "A" || f.status === "?" ? "text-add-ink" : f.status === "D" ? "text-del-ink" : "text-mute")}>{STATUS_LABEL[f.status]}</span>
            <span className="truncate">{f.path}</span>
          </button>
        ))}
      </Panel>
      <Panel k="commits" title="Commits" count={commits.length}>
        {!commits.length && <p className="m-0 px-2 py-1 text-mute">コミットはありません</p>}
        {commits.map((c, i) => (
          <button key={c.hash} type="button" tabIndex={-1} role="option" aria-selected={p.gfocus === "commits" && p.gi.commits === i} title={`${c.short} ${c.subject}\n${c.author}`} onClick={() => pick("commits", i)} className={clsx("flex w-full items-baseline gap-2 rounded-md px-2 py-0.5 text-left", p.gi.commits === i && (p.gfocus === "commits" ? "bg-soft" : "bg-soft/50"))}>
            <span className="flex-none font-mono text-[11px] text-mute">{c.short}</span>
            <span className="truncate">{c.subject}</span>
            <span className="ml-auto flex-none text-xs text-mute">{relTime(c.time)}</span>
          </button>
        ))}
      </Panel>
    </div>
  );
}
