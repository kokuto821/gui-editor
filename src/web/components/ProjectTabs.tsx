import clsx from "clsx";
import { baseOf } from "../paths";
import { useApp } from "../stores/app";

export function ProjectTabs() {
  const projects = useApp((s) => s.projects);
  const active = useApp((s) => s.active);
  const switchProject = useApp((s) => s.switchProject);
  const closeProject = useApp((s) => s.closeProject);

  return (
    <div role="tablist" aria-label="プロジェクト" className="flex min-w-0 overflow-x-auto border-b border-line">
      {projects.map((p, i) => (
        <div
          key={p.root}
          role="tab"
          aria-selected={i === active}
          className={clsx(
            "group flex max-w-56 items-center border-r border-line",
            i === active ? "bg-soft text-ink" : "text-mute",
          )}
        >
          <button className="h-8 truncate pr-1 pl-3 whitespace-nowrap" title={`${p.root}  Alt+${i + 1}`} onClick={() => void switchProject(i)}>
            {baseOf(p.root) || "/"}
          </button>
          <button
            className="mr-1 rounded px-1.5 opacity-0 group-hover:opacity-70 hover:bg-bg"
            aria-label={`${baseOf(p.root)}を閉じる`}
            onClick={() => void closeProject(i)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
