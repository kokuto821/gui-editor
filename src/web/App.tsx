import { backend } from "./backend";
import { DialogHost, Toast } from "./components/Dialog";
import { DiffPane } from "./components/DiffPane";
import { EmptyState } from "./components/EmptyState";
import { BookmarkList, FileList, SideSwitch } from "./components/FileList";
import { GitPanes } from "./components/GitPanes";
import { MenuHost } from "./components/Menu";
import { Preview } from "./components/Preview";
import { PreviewTabs } from "./components/PreviewTabs";
import { ProjectTabs } from "./components/ProjectTabs";
import { StatusBar } from "./components/StatusBar";
import { Toolbar } from "./components/Toolbar";
import { useSplitDrag } from "./hooks/useSplitDrag";
import { useApp, useProject } from "./stores/app";
import { DEFAULT_SETTINGS, useSettings } from "./stores/settings";

const DEFAULT_WIDTH = DEFAULT_SETTINGS.layout.listWidth;

function Main() {
  const p = useProject();
  const layout = useSettings((s) => s.s.layout);
  const update = useSettings((s) => s.update);
  const setWidth = (w: number) => update((s) => ({ ...s, layout: { ...s.layout, listWidth: w } }));
  const drag = useSplitDrag(layout.listWidth, setWidth, DEFAULT_WIDTH);
  if (!p) return <EmptyState />;
  const { panels } = layout;
  const diff = p.view === "diff";
  return (
    <div className="flex min-h-0">
      {panels.list && (
        <>
          <div className="list-col flex min-h-0 flex-none flex-col overflow-hidden" style={{ width: layout.listWidth }}>
            <SideSwitch />
            {diff ? <GitPanes /> : p.side === "bm" ? <BookmarkList /> : <FileList />}
          </div>
          <div role="separator" aria-orientation="vertical" aria-label="一覧の幅（ドラッグで変更、ダブルクリックで戻す）" className="group relative w-px flex-none cursor-col-resize bg-line" {...drag}>
            <span className="absolute inset-y-0 -left-1 w-2.5 group-hover:bg-soft/70" />
          </div>
        </>
      )}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {diff ? (
          <DiffPane />
        ) : (
          <>
            {panels.previewTabs && <PreviewTabs />}
            <div className="min-h-0 flex-1">
              <Preview />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function App() {
  const ready = useApp((s) => s.ready);
  const panels = useSettings((s) => s.s.layout.panels);

  if (!backend.hasToken)
    return (
      <div className="grid h-full place-items-center p-6 text-center text-mute">
        <p>
          このページは、トークン付きの URL から開く必要があります。
          <br />
          ターミナルで <code className="mx-1 font-mono">cgui .</code> を実行すると、URL が表示されます。
        </p>
      </div>
    );

  return (
    <div className="grid h-full" style={{ gridTemplateRows: `34px ${panels.projectTabs ? "auto" : "0px"} minmax(0,1fr) ${panels.status ? "28px" : "0px"}` }}>
      <Toolbar />
      <div className="min-w-0 overflow-hidden">{panels.projectTabs && <ProjectTabs />}</div>
      {ready ? <Main /> : <div className="grid place-items-center text-mute">接続しています…</div>}
      <div className="overflow-hidden">{panels.status && <StatusBar />}</div>
      <MenuHost />
      <DialogHost />
      <Toast />
    </div>
  );
}
