import { baseOf, tilde } from "../paths";
import { useApp, useProject } from "../stores/app";

export function StatusBar() {
  const p = useProject();
  const home = useApp((s) => s.home);
  const connected = useApp((s) => s.connected);
  const selName = p?.sel[p.cwd];
  const crumb = p ? tilde(p.cwd, home) + (selName ? ` / ${selName}` : "") : "プロジェクトなし";

  return (
    <div className="flex items-center gap-3 border-t border-line px-3 text-xs text-mute">
      <span className="min-w-0 flex-1 truncate" title={p?.root}>
        {p && baseOf(p.root) + " · "}
        <b className="font-medium text-ink">{crumb}</b>
      </span>
      {!connected && <span className="text-del-ink">接続が切れています</span>}
      <span className="hidden flex-none sm:block">↑↓ 移動 ←→ 階層 d u スクロール</span>
    </div>
  );
}
