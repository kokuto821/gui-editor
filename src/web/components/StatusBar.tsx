import { UP, currentOf, shownOf, useApp, useProject } from "../stores/app";
import { baseOf, dirOf, isInside, tilde } from "../paths";
import { useDocs } from "../stores/docs";
import { MOD } from "../keys";

export const Kbd = ({ children }: { children: React.ReactNode }) => <kbd className="rounded border border-line bg-code px-1 font-mono text-[10px] text-ink">{children}</kbd>;

export function StatusBar() {
  const p = useProject();
  const entries = useApp((s) => s.entries);
  const home = useApp((s) => s.home);
  const connected = useApp((s) => s.connected);
  const docs = useDocs((s) => s.docs);
  const c = currentOf(p, entries);

  const parts: string[] = [];
  if (p) {
    parts.push(baseOf(p.root) || "/");
    if (p.view === "diff") parts.push("差分", p.gfocus === "changes" ? "Changes" : "Commits");
    else {
      if (p.side === "bm") parts.push("ブックマーク");
      if (p.side === "search") parts.push("検索");
      // 検索の表示では、今のタブのファイルの場所（ファイルがなければ出さない）
      const dir = p.side !== "files" && c ? dirOf(c.path) : p.side === "search" ? null : p.cwd;
      // プロジェクトの中は、フォルダからの相対パスで。外にいるときは、~ から
      if (dir !== null) {
        if (isInside(p.root, dir)) parts.push(...dir.slice(p.root.length).split("/").filter(Boolean));
        else parts.push(tilde(dir, home));
      }
      if (c && c.name !== UP) parts.push(c.name);
    }
  }
  const f = shownOf(p, entries);
  const editing = !!(f && p?.mode[f.path] === "edit" && docs[f.path]);
  return (
    <div className="flex items-center gap-3 border-t border-line px-3 text-xs text-mute">
      <span className="min-w-0 flex-1 truncate" title={p?.root}>
        {parts.length ? parts.map((x, i) => (i === parts.length - 1 ? <b key={i} className="font-medium text-ink">{x}</b> : <span key={i}>{x} / </span>)) : "プロジェクトなし"}
      </span>
      {!connected && <span className="text-del-ink">接続が切れています</span>}
      <span className="hidden flex-none sm:block">
        {p?.view === "diff" ? (
          <><Kbd>↑↓</Kbd> 選択 <Kbd>←→</Kbd> パネル <Kbd>d u</Kbd> スクロール <Kbd>v</Kbd> ファイル</>
        ) : editing ? (
          <><Kbd>{MOD}S</Kbd> 保存 <Kbd>Esc</Kbd> 閲覧に戻る</>
        ) : p?.side === "search" ? (
          <><Kbd>↑↓</Kbd> 結果 <Kbd>/</Kbd> 入力へ <Kbd>{MOD}F</Kbd> ページ内検索 <Kbd>{MOD}P</Kbd> ファイルを開く</>
        ) : (
          <><Kbd>↑↓</Kbd> 移動 <Kbd>←→</Kbd> 階層 <Kbd>e</Kbd> 編集 <Kbd>d u</Kbd> スクロール <Kbd>v</Kbd> 差分 <Kbd>{MOD}P</Kbd> ファイルを開く <Kbd>{MOD}Shift+F</Kbd> 検索</>
        )}
      </span>
    </div>
  );
}
