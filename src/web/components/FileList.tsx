import clsx from "clsx";
import { useEffect, useRef } from "react";
import type { Entry } from "../../shared/protocol";
import { baseOf, dirOf, extOf, tilde } from "../paths";
import { UP, currentOf, useApp, useProject } from "../stores/app";
import { isDirty, useDocs } from "../stores/docs";
import { useGit } from "../stores/git";
import { bookmarksOf, useSettings } from "../stores/settings";
import { useUi } from "../stores/ui";
import { IconBookmark, IconFile, IconGit, IconMore, IconSearch, IconX } from "./Icons";

const MOD = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl+";
export const extBadge = (name: string) => extOf(name).slice(0, 4) || "·";
const badge = (e: Pick<Entry, "kind" | "name">) => (e.kind === "dir" ? "▸" : extBadge(e.name));
/** 拡張子は小さい文字で。記号（フォルダの ▸、拡張子なしの ·）は小さいと見えないので大きく */
export const badgeCls = (text: string) => clsx("w-9 flex-none font-mono text-mute uppercase", text === "▸" || text === "·" ? "text-[13px] leading-none" : "text-[9px]");

/** 上の切替: ブックマーク / ファイル / 検索 / Git の差分（バッジは未コミットの件数） */
export function SideSwitch() {
  const p = useProject();
  const setSide = useApp((s) => s.setSide);
  const toggleView = useApp((s) => s.toggleView);
  const repo = useGit((s) => (p ? s.repos[p.root] : undefined));
  if (!p) return null;
  const n = repo?.files.length ?? 0;
  const cur = p.view === "diff" ? "git" : p.side;
  const B = ({ k, label, onClick, children, badgeN }: { k: string; label: string; onClick: () => void; children: React.ReactNode; badgeN?: number }) => (
    <button type="button" tabIndex={-1} title={label} aria-label={label} aria-pressed={cur === k} onClick={onClick} className={clsx("relative grid h-[26px] w-[30px] place-items-center rounded-md text-mute hover:bg-soft hover:text-ink", cur === k && "bg-soft text-ink")}>
      {children}
      {!!badgeN && <span className="absolute -top-0.5 -right-0.5 min-w-[13px] rounded-full bg-ink px-[3px] font-mono text-[9px] leading-[13px] text-bg">{badgeN}</span>}
    </button>
  );
  return (
    <div className="flex items-center gap-1 border-b border-line p-1.5" role="group" aria-label="一覧の表示">
      <B k="bm" label="ブックマーク" onClick={() => void setSide("bm")}><IconBookmark /></B>
      <B k="files" label="ファイル" onClick={() => void setSide("files")}><IconFile /></B>
      <B k="search" label={`検索（${MOD}Shift+F）`} onClick={() => void setSide("search")}><IconSearch /></B>
      <B k="git" label={`Git の差分（v）${n ? `・未コミット ${n} 件` : ""}`} onClick={() => p.view === "diff" || void toggleView()} badgeN={n}><IconGit /></B>
    </div>
  );
}

function RenameInput({ entry, path }: { entry: Pick<Entry, "kind" | "name">; path: string }) {
  const rename = useApp((s) => s.renameEntry);
  const setRenaming = useUi((s) => s.setRenaming);
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const dot = entry.kind === "dir" ? -1 : el.value.lastIndexOf(".");
    el.setSelectionRange(0, dot > 0 ? dot : el.value.length); // 拡張子の手前まで選ぶ
  }, [entry]);
  const finish = (commit: boolean) => {
    if (done.current) return;
    done.current = true;
    const v = ref.current?.value.trim() ?? "";
    setRenaming(null);
    if (commit && v) void rename(path, v);
  };
  return (
    <input
      ref={ref}
      defaultValue={entry.name}
      spellCheck={false}
      aria-label="新しい名前"
      className="min-w-0 flex-1 rounded border border-ink bg-bg px-1 outline-none"
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter" && !e.nativeEvent.isComposing) finish(true);
        else if (e.key === "Escape") finish(false);
      }}
      onBlur={() => finish(true)}
    />
  );
}

function MoreButton({ path, isDir }: { path: string; isDir: boolean }) {
  const openMenu = useUi((s) => s.openMenu);
  const menu = useUi((s) => s.menu);
  const open = menu?.kind === "row" && menu.path === path;
  return (
    <span
      role="button"
      data-more=""
      tabIndex={-1}
      title="メニュー"
      aria-label="メニュー"
      aria-haspopup="menu"
      className={clsx("row-more size-6 flex-none place-items-center rounded text-mute hover:bg-bg hover:text-ink", open && "bg-bg text-ink")}
      onClick={(e) => {
        e.stopPropagation();
        if (open) return useUi.getState().closeMenu();
        openMenu({ kind: "row", path, isDir, anchor: e.currentTarget.getBoundingClientRect() });
      }}
    >
      <IconMore />
    </span>
  );
}

export function FileList() {
  const entries = useApp((s) => s.entries);
  const error = useApp((s) => s.listError);
  const pane = useApp((s) => s.pane);
  const select = useApp((s) => s.select);
  const enter = useApp((s) => s.enter);
  const up = useApp((s) => s.up);
  const setPane = useApp((s) => s.setPane);
  const openInNewTab = useApp((s) => s.openInNewTab);
  const docs = useDocs((s) => s.docs);
  const renaming = useUi((s) => s.renaming);
  const p = useProject();
  const selName = p?.sel[p.cwd];
  const listRef = useRef<HTMLDivElement>(null);
  const enteredAt = useRef(0);

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [selName, entries]);

  if (!p) return null;
  const path = (name: string) => (p.cwd === "/" ? `/${name}` : `${p.cwd}/${name}`);
  return (
    <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-1.5" role="listbox" aria-label="ファイル" onMouseDown={() => setPane("list")}>
      {error && <p className="px-3 py-2 text-del-ink">{error}</p>}
      {!error && !entries.some((e) => e.name !== UP) && <p className="px-3 py-2 text-mute">空のフォルダです</p>}
      {entries.map((e) => {
        const full = path(e.name);
        const sel = e.name === selName;
        if (e.name === UP)
          return (
            <div key={UP} className={clsx("row flex items-center rounded-md", sel && (pane === "preview" ? "bg-soft/60" : "bg-soft"))} role="option" aria-selected={sel} data-row="">
              <button
                type="button"
                tabIndex={-1}
                title="1つ上のフォルダへ"
                className="flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-0.5 text-left"
                onClick={() => {
                  if (Date.now() - enteredAt.current < 500) return;
                  enteredAt.current = Date.now();
                  void up();
                }}
              >
                <span className="w-9 flex-none font-mono text-[13px] leading-none text-mute">↑</span>
                <span className="truncate text-mute">..</span>
              </button>
            </div>
          );
        if (renaming === full)
          return (
            <div key={e.name} className="flex items-center gap-2.5 rounded-md bg-soft px-2.5 py-0.5">
              <span className={badgeCls(badge(e))}>{badge(e)}</span>
              <RenameInput entry={e} path={full} />
            </div>
          );
        return (
          <div key={e.name} className={clsx("row group flex items-center rounded-md", sel && (pane === "preview" ? "bg-soft/60" : "bg-soft"))} role="option" aria-selected={sel} data-row="">
            <button
              type="button"
              tabIndex={-1}
              className="flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-0.5 text-left"
              onClick={() => {
                if (Date.now() - enteredAt.current < 500) return; // フォルダに入った直後の2回目のクリックは、移動先の行に効かせない
                if (e.kind !== "dir") return void select(e.name);
                enteredAt.current = Date.now();
                void select(e.name).then(enter); // フォルダは開かず、その中へ移動するだけ
              }}
              onDoubleClick={() => e.kind !== "dir" && Date.now() - enteredAt.current >= 500 && void openInNewTab(full)}
            >
              <span className={badgeCls(badge(e))}>{badge(e)}</span>
              <span className={clsx("truncate", e.kind === "binary" && "text-mute")}>
                {e.name}
                {e.kind === "dir" ? "/" : ""}
              </span>
              {isDirty(docs[full]) && <span className="ml-auto flex-none text-[8px]" title="未保存">●</span>}
            </button>
            <MoreButton path={full} isDir={e.kind === "dir"} />
          </div>
        );
      })}
    </div>
  );
}

export function BookmarkList() {
  const p = useProject();
  const s = useSettings((x) => x.s);
  const entries = useApp((x) => x.entries);
  const selectBm = useApp((x) => x.selectBm);
  const setPane = useApp((x) => x.setPane);
  const toggleBookmark = useApp((x) => x.toggleBookmark);
  const openInNewTab = useApp((x) => x.openInNewTab);
  const docs = useDocs((x) => x.docs);
  const home = useApp((x) => x.home);
  if (!p) return null;
  const bms = bookmarksOf(s, p.root);
  const cur = currentOf(p, entries)?.path;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-1.5" role="listbox" aria-label="ブックマーク" onMouseDown={() => setPane("list")}>
      {!bms.length && <p className="px-3 py-2 text-mute">ブックマークはありません</p>}
      {bms.map((path) => {
        const dir = tilde(dirOf(path), home).replace(tilde(p.root, home) + "/", "").replace(tilde(p.root, home), "");
        return (
          <div key={path} className={clsx("group flex items-center rounded-md", path === cur && "bg-soft")} role="option" aria-selected={path === cur}>
            <button type="button" tabIndex={-1} title={path} className="flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-0.5 text-left" onClick={() => void selectBm(path)} onDoubleClick={() => void openInNewTab(path)}>
              <span className={badgeCls(extBadge(path))}>{extBadge(path)}</span>
              <span className="truncate">{baseOf(path)}</span>
              {dir && <span className="truncate text-xs text-mute">{dir}/</span>}
              {isDirty(docs[path]) && <span className="ml-auto flex-none text-[8px]" title="未保存">●</span>}
            </button>
            <span
              role="button"
              tabIndex={-1}
              title="ブックマークから削除"
              aria-label={`${baseOf(path)}をブックマークから削除`}
              className="mr-1 grid size-6 flex-none place-items-center rounded text-mute opacity-0 group-hover:opacity-100 hover:bg-bg hover:text-ink"
              onClick={() => toggleBookmark(path)}
            >
              <IconX />
            </span>
          </div>
        );
      })}
    </div>
  );
}
