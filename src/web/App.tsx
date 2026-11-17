import { FileList } from "./components/FileList";
import { Preview } from "./components/Preview";
import { ProjectTabs } from "./components/ProjectTabs";
import { StatusBar } from "./components/StatusBar";
import { useApp } from "./stores/app";

export function App() {
  const ready = useApp((s) => s.ready);
  const hasProject = useApp((s) => s.projects.length > 0);

  return (
    <div className="grid h-full grid-rows-[auto_minmax(0,1fr)_28px]">
      <ProjectTabs />
      {!ready ? (
        <div className="grid place-items-center text-mute">接続しています…</div>
      ) : !hasProject ? (
        <div className="grid place-items-center text-mute">ターミナルで <code className="mx-1 font-mono">cgui .</code> を実行すると、ここに開きます</div>
      ) : (
        <div className="grid min-h-0 grid-cols-[300px_minmax(0,1fr)]">
          <div className="min-h-0 border-r border-line">
            <FileList />
          </div>
          <div className="min-h-0">
            <Preview />
          </div>
        </div>
      )}
      <StatusBar />
    </div>
  );
}
