import clsx from "clsx";
import { useRef } from "react";
import { MOD } from "../keys";
import { shownOf, useApp, useProject } from "../stores/app";
import { isDirty, useDocs } from "../stores/docs";
import { useSearch } from "../stores/search";
import { useUi } from "../stores/ui";
import { IconEye, IconHome, IconLayout, IconPencil, IconPlus, IconSave, IconSearch } from "./Icons";

function Btn({ label, onClick, disabled, active, children, refEl, haspopup }: {
  label: string; onClick: () => void; disabled?: boolean; active?: boolean; children: React.ReactNode;
  refEl?: React.RefObject<HTMLButtonElement | null>; haspopup?: boolean;
}) {
  return (
    <button
      ref={refEl}
      type="button"
      title={label}
      aria-label={label}
      aria-haspopup={haspopup ? "menu" : undefined}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()} // フォーカスを奪わない（編集中のカーソルを動かさない）
      onClick={onClick}
      className={clsx(
        "grid h-[26px] w-[30px] place-items-center rounded-md text-mute hover:not-disabled:bg-soft hover:not-disabled:text-ink disabled:opacity-35",
        active && "bg-soft text-ink",
      )}
    >
      {children}
    </button>
  );
}

export function Toolbar() {
  const p = useProject();
  const entries = useApp((s) => s.entries);
  const docs = useDocs((s) => s.docs);
  const toggleMode = useApp((s) => s.toggleMode);
  const saveCurrent = useApp((s) => s.saveCurrent);
  const goRoot = useApp((s) => s.goRoot);
  const openMenu = useUi((s) => s.openMenu);
  const menu = useUi((s) => s.menu);
  const closeMenu = useUi((s) => s.closeMenu);
  const openQuick = useSearch((s) => s.openQuick);
  const plusRef = useRef<HTMLButtonElement>(null);
  const layRef = useRef<HTMLButtonElement>(null);

  const c = shownOf(p, entries);
  const doc = c && p?.view === "files" && p.tabs.length ? docs[c.path] : undefined;
  const editing = !!(c && p?.mode[c.path] === "edit");
  const atRoot = !!p && p.view === "files" && p.side === "files" && p.cwd === p.root;
  const toggle = (kind: "proj" | "layout", el: HTMLButtonElement | null) => {
    if (menu?.kind === kind) return closeMenu();
    if (el) openMenu({ kind, anchor: el.getBoundingClientRect() });
  };

  return (
    <div className="flex items-center gap-0.5 border-b border-line px-1.5" role="toolbar" aria-label="ツールバー">
      <Btn refEl={plusRef} label="プロジェクトを開く" haspopup active={menu?.kind === "proj"} onClick={() => toggle("proj", plusRef.current)}><IconPlus /></Btn>
      <span className="mx-1 h-4 w-px bg-line" />
      <Btn
        label={!doc ? "閲覧 / 編集（テキストのファイルを選ぶと使える）" : editing ? "編集中（クリックで閲覧） e" : "閲覧中（クリックで編集） e"}
        disabled={!doc}
        onClick={toggleMode}
      >
        {editing ? <IconPencil /> : <IconEye />}
      </Btn>
      <Btn
        label={isDirty(doc) ? `保存（${MOD}S）` : "保存（未保存の変更はありません）"}
        disabled={!isDirty(doc)}
        onClick={() => void saveCurrent()}
      >
        <IconSave />
      </Btn>
      <Btn label={p ? `プロジェクトのフォルダへ戻る（${p.root}）` : "プロジェクトのフォルダへ戻る"} disabled={!p || atRoot} onClick={() => void goRoot()}><IconHome /></Btn>
      <span className="mx-1 h-4 w-px bg-line" />
      <Btn label="ファイルを開く" disabled={!p} onClick={() => p && void openQuick(p.root)}><IconSearch /></Btn>
      <Btn refEl={layRef} label="表示するパネル" haspopup active={menu?.kind === "layout"} onClick={() => toggle("layout", layRef.current)}><IconLayout /></Btn>
    </div>
  );
}
