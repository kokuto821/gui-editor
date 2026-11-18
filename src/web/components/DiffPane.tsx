import clsx from "clsx";
import { useMemo } from "react";
import { parseDiff } from "../lib/diff";
import { useProject } from "../stores/app";
import { useGit } from "../stores/git";

const KIND: Record<string, string> = { added: "追加", deleted: "削除", renamed: "名前変更", binary: "バイナリ", modified: "" };

/** 右の差分（unified、前後3行、行番号付き。追加は緑、削除は赤） */
export function DiffPane() {
  const p = useProject();
  const diff = useGit((s) => s.diff);
  const repo = useGit((s) => (p ? s.repos[p.root] : undefined));
  const name = p?.gfocus === "changes" ? repo?.files[p.gi.changes]?.path : undefined;
  const files = useMemo(() => (diff ? parseDiff(diff.patch, name) : []), [diff?.patch, name]);

  let body: React.ReactNode;
  if (!diff) body = <p className="m-0 p-5 text-mute">{p?.gfocus === "changes" ? "変更はありません" : "コミットを選んでください"}</p>;
  else if (diff.loading) body = <p className="m-0 p-5 text-mute">読み込んでいます…</p>;
  else if (diff.error) body = <p className="m-0 p-5 text-del-ink">差分を読み込めませんでした</p>;
  else if (!files.length) body = <p className="m-0 p-5 text-mute">差分はありません</p>;
  else
    body = (
      <div className="pb-10">
        {files.map((f, fi) => (
          <section key={fi} className="mb-5" aria-label={f.path}>
            <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-bg px-4 py-1.5">
              <span className="truncate font-medium">{f.path}</span>
              {KIND[f.kind] && <span className="rounded bg-soft px-1.5 text-[11px] text-mute">{KIND[f.kind]}</span>}
              <span className="ml-auto flex-none font-mono text-xs"><span className="text-add-ink">+{f.add}</span> <span className="text-del-ink">−{f.del}</span></span>
            </header>
            {f.kind === "binary" && !f.hunks.length && <p className="m-0 px-4 py-2 text-mute">バイナリファイルは、差分を表示しません</p>}
            {f.hunks.map((h, hi) => (
              <div key={hi} className="font-mono text-[12.5px] leading-[1.6]">
                <div className="bg-code px-4 py-0.5 text-mute">{h.header}</div>
                {h.lines.map((l, li) => (
                  <div key={li} className={clsx("flex", l.t === "add" && "bg-add-bg", l.t === "del" && "bg-del-bg")}>
                    <span className="w-12 flex-none px-2 text-right text-mute select-none">{l.o ?? ""}</span>
                    <span className="w-12 flex-none px-2 text-right text-mute select-none">{l.n ?? ""}</span>
                    <span className={clsx("w-4 flex-none text-center select-none", l.t === "add" && "text-add-ink", l.t === "del" && "text-del-ink")}>{l.t === "add" ? "+" : l.t === "del" ? "−" : ""}</span>
                    <span className="min-w-0 flex-1 pr-4 whitespace-pre">{l.text}</span>
                  </div>
                ))}
              </div>
            ))}
          </section>
        ))}
        {diff.truncated && <p className="m-0 px-4 text-mute">差分が大きいため、途中までを表示しています</p>}
      </div>
    );
  return <div id="preview-scroll" className="h-full overflow-auto">{body}</div>;
}
