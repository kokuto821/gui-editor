import clsx from "clsx";
import { useEffect, useRef } from "react";
import type { EntryKind } from "../../shared/protocol";
import { extOf } from "../paths";
import { useApp, useProject } from "../stores/app";

const badge = (kind: EntryKind, name: string) => (kind === "dir" ? "▸" : extOf(name) || "·");

export function FileList() {
  const entries = useApp((s) => s.entries);
  const error = useApp((s) => s.error);
  const pane = useApp((s) => s.pane);
  const select = useApp((s) => s.select);
  const enter = useApp((s) => s.enter);
  const setPane = useApp((s) => s.setPane);
  const p = useProject();
  const selName = p?.sel[p.cwd];
  const listRef = useRef<HTMLDivElement>(null);

  // 選択が動いたら、見える位置までスクロールする
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [selName, entries]);

  return (
    <div ref={listRef} className="h-full overflow-y-auto p-1.5" role="listbox" aria-label="ファイル" onMouseDown={() => setPane("list")}>
      {error && <p className="px-3 py-2 text-del-ink">{error}</p>}
      {!error && entries.length === 0 && <p className="px-3 py-2 text-mute">空のフォルダです</p>}
      {entries.map((e) => (
        <button
          key={e.name}
          role="option"
          aria-selected={e.name === selName}
          tabIndex={-1}
          className={clsx(
            "flex w-full items-center gap-2.5 rounded-md px-2.5 py-0.5 text-left",
            e.name === selName && "bg-soft",
            pane === "preview" && e.name === selName && "bg-soft/60",
          )}
          onClick={() => void select(e.name)}
          onDoubleClick={() => e.kind === "dir" && void enter()}
        >
          <span className="w-9 flex-none font-mono text-[9px] text-mute uppercase">{badge(e.kind, e.name)}</span>
          <span className={clsx("truncate", e.kind === "binary" && "text-mute")}>
            {e.name}
            {e.kind === "dir" ? "/" : ""}
          </span>
        </button>
      ))}
    </div>
  );
}
