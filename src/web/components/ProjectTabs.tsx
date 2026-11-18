import clsx from "clsx";
import { projectLabel } from "../stores/settings";
import { useApp } from "../stores/app";
import { IconPlus } from "./Icons";

export function ProjectTabs() {
  const projects = useApp((s) => s.projects);
  const active = useApp((s) => s.active);
  const home = useApp((s) => s.home);
  const switchProject = useApp((s) => s.switchProject);
  const closeProject = useApp((s) => s.closeProject);
  const newProject = useApp((s) => s.newProject);

  return (
    <div className="flex items-stretch border-b border-line">
      <div role="tablist" aria-label="プロジェクト" className="flex min-w-0 overflow-x-auto">
        {projects.map((p, i) => {
          const name = projectLabel(p.root, home);
          return (
            <div key={p.root} role="tab" aria-selected={i === active} className={clsx("group flex max-w-56 flex-none items-center border-r border-line", i === active ? "bg-soft text-ink" : "text-mute")}>
              <button type="button" className="h-8 truncate pr-1 pl-3 whitespace-nowrap" title={`${p.root}  Alt+${i + 1}`} onClick={() => void switchProject(i)}>
                {name}
              </button>
              <button
                type="button"
                className={clsx("mr-1 rounded px-1.5 hover:bg-bg", i === active ? "opacity-70" : "opacity-0 group-hover:opacity-70")}
                aria-label={`${name}を閉じる`}
                onClick={() => void closeProject(i)}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
      <button type="button" title="新しいプロジェクト（~）  Alt+T" aria-label="新しいプロジェクト" onClick={() => void newProject()} className="grid w-8 flex-none place-items-center text-mute hover:bg-soft hover:text-ink">
        <IconPlus />
      </button>
    </div>
  );
}
