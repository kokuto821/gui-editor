import clsx from "clsx";
import { baseOf, extOf } from "../paths";
import { useApp, useProject } from "../stores/app";
import { isDirty, useDocs } from "../stores/docs";
import { IconPlus } from "./Icons";

/** プレビューの上のタブ。アクティブなタブは、一覧で選んでいるものに従う */
export function PreviewTabs() {
  const p = useProject();
  const docs = useDocs((s) => s.docs);
  const switchTab = useApp((s) => s.switchTab);
  const closeTab = useApp((s) => s.closeTab);
  const dupTab = useApp((s) => s.dupTab);
  if (!p) return null;
  return (
    <div className="flex items-stretch border-b border-line">
      <div role="tablist" aria-label="開いているファイル" className="flex min-w-0 overflow-x-auto [scrollbar-width:none]">
        {p.tabs.map((path, i) => {
          const on = i === p.tabIndex;
          const dirty = isDirty(docs[path]);
          return (
            <div key={`${i}:${path}`} role="tab" aria-selected={on} className={clsx("group flex max-w-52 flex-none items-center border-r border-line", on ? "bg-soft text-ink" : "text-mute", dirty && "dirty")}>
              <button type="button" tabIndex={-1} title={path} className="flex h-8 min-w-0 items-center gap-1.5 pr-1 pl-2.5" onClick={() => void switchTab(i)}>
                <span className="font-mono text-[9px] uppercase">{extOf(baseOf(path)) || "·"}</span>
                <span className="truncate">{baseOf(path) || "（なし）"}</span>
              </button>
              <button
                type="button"
                tabIndex={-1}
                aria-label={`${baseOf(path)}のタブを${dirty ? "閉じる（未保存）" : "閉じる"}`}
                title={dirty ? "未保存" : "閉じる"}
                className={clsx("mr-1 grid size-5 place-items-center rounded text-[13px] leading-none hover:bg-bg", on || dirty ? "opacity-80" : "opacity-0 group-hover:opacity-70")}
                onClick={() => void closeTab(i)}
              >
                {dirty ? <><span className="text-[9px] group-hover:hidden">●</span><span className="hidden group-hover:inline">×</span></> : "×"}
              </button>
            </div>
          );
        })}
      </div>
      <button type="button" tabIndex={-1} title="タブを追加（今のタブを複製）" aria-label="タブを追加" className="grid w-8 flex-none place-items-center text-mute hover:bg-soft hover:text-ink" onClick={() => void dupTab()}>
        <IconPlus />
      </button>
    </div>
  );
}
