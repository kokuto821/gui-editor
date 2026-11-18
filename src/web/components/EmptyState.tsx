import { projectLabel, useSettings } from "../stores/settings";
import { useApp } from "../stores/app";
import { IconBookmark } from "./Icons";

/** プロジェクトが0件のとき: ブックマークしたプロジェクトと、新しいプロジェクト */
export function EmptyState() {
  const favs = useSettings((s) => s.s.favoriteProjects);
  const home = useApp((s) => s.home);
  const openProject = useApp((s) => s.openProject);
  const newProject = useApp((s) => s.newProject);
  return (
    <div className="grid place-content-center justify-items-center gap-3 text-mute">
      <p className="m-0">開いているプロジェクトはありません</p>
      {!!favs.length && (
        <div className="flex flex-wrap justify-center gap-2">
          {favs.map((f) => (
            <button key={f} type="button" title={f} onClick={() => void openProject(f)} className="flex items-center gap-1.5 rounded-md border border-line px-3 py-1 text-ink hover:bg-soft">
              <IconBookmark />
              {projectLabel(f, home)}
            </button>
          ))}
        </div>
      )}
      <button type="button" onClick={() => void newProject()} className="rounded-md border border-line px-3 py-1 text-ink hover:bg-soft">新しいプロジェクト（Alt+T）</button>
    </div>
  );
}
