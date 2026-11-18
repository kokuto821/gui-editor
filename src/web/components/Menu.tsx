import clsx from "clsx";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { bookmarksOf, isFavorite, projectLabel, useSettings } from "../stores/settings";
import { useApp, useProject } from "../stores/app";
import { useUi } from "../stores/ui";
import { baseOf, tilde } from "../paths";
import { IconBookmark, IconCopy, IconFolder, IconPlus, IconRename, IconTrash, IconX, PanelIcon } from "./Icons";

type Item = { id: string; label: string; icon?: React.ReactNode; danger?: boolean; checked?: boolean; on?: boolean; sub?: string; onClick: () => void; extra?: React.ReactNode };

function MenuBox({ anchor, align, children }: { anchor: DOMRect; align: "left" | "right"; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: -9999, top: 0 });
  // 画面からはみ出さない位置に出す
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const w = m.offsetWidth, h = m.offsetHeight;
    let left = align === "right" ? anchor.right - w : anchor.left;
    left = Math.max(6, Math.min(window.innerWidth - w - 6, left));
    let top = anchor.bottom + 4;
    if (top + h > window.innerHeight - 6) top = Math.max(6, anchor.top - h - 4);
    setPos({ left, top });
  }, [anchor, align]);
  useEffect(() => ref.current?.querySelector<HTMLElement>("button")?.focus(), []);
  const onKeyDown = (e: React.KeyboardEvent) => {
    const items = [...(ref.current?.querySelectorAll<HTMLElement>("[role^=menuitem]") ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const n = items.length;
      items[i < 0 ? (e.key === "ArrowDown" ? 0 : n - 1) : (i + (e.key === "ArrowDown" ? 1 : n - 1)) % n]?.focus();
    }
  };
  return (
    <div ref={ref} role="menu" onKeyDown={onKeyDown} style={pos} className="fixed z-40 min-w-56 max-w-80 rounded-lg border border-line bg-bg p-1 shadow-[0_6px_24px_rgba(0,0,0,.16)]">
      {children}
    </div>
  );
}

function Row({ it }: { it: Item }) {
  return (
    <div className="group relative">
      <button
        type="button"
        role={it.checked !== undefined ? "menuitemcheckbox" : "menuitem"}
        aria-checked={it.checked}
        onClick={it.onClick}
        className={clsx("flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left hover:bg-soft focus-visible:bg-soft", it.danger && "text-del-ink", it.on && "font-medium")}
      >
        <span className="grid flex-none place-items-center">{it.icon}</span>
        <span className="min-w-0 flex-1 truncate">{it.label}</span>
        {it.sub && <span className="max-w-32 truncate text-xs text-mute">{it.sub}</span>}
        {it.extra && <span className="w-5" />}
      </button>
      {it.extra && <span className="absolute top-1/2 right-1.5 -translate-y-1/2">{it.extra}</span>}
    </div>
  );
}

export function MenuHost() {
  const menu = useUi((s) => s.menu);
  const closeMenu = useUi((s) => s.closeMenu);
  const setRenaming = useUi((s) => s.setRenaming);
  const app = useApp();
  const settings = useSettings();
  const p = useProject();

  // メニューの外を押したら閉じる。Esc でも閉じる
  useEffect(() => {
    if (!menu) return;
    const down = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest('[role="menu"], [aria-haspopup], [data-more]')) closeMenu();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closeMenu();
      }
    };
    const away = () => closeMenu();
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("keydown", key, true);
    window.addEventListener("resize", away);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("resize", away);
    };
  }, [menu, closeMenu]);

  if (!menu) return null;
  const done = (fn: () => void) => () => (closeMenu(), fn());

  if (menu.kind === "row") {
    const path = menu.path;
    const name = baseOf(path);
    const items: Item[] = [];
    if (menu.isDir) {
      const fav = isFavorite(settings.s, path);
      items.push(
        { id: "fav", label: fav ? "プロジェクトのブックマークから削除" : "プロジェクトとしてブックマークに追加", icon: <IconBookmark />, on: fav, onClick: done(() => app.toggleFavorite(path)) },
        { id: "open", label: "プロジェクトとして開く", icon: <IconFolder />, onClick: done(() => void app.openProject(path)) },
      );
    } else {
      const on = !!p && bookmarksOf(settings.s, p.root).includes(path);
      items.push({ id: "bm", label: on ? "ブックマークから削除" : "ブックマークに追加", icon: <IconBookmark />, on, onClick: done(() => app.toggleBookmark(path)) });
    }
    items.push(
      { id: "rename", label: "名前を変更", icon: <IconRename />, onClick: done(() => setRenaming(path)) },
      { id: "copy", label: "パスをコピー", icon: <IconCopy />, onClick: done(() => void app.copyPath(path)) },
      { id: "del", label: "削除", icon: <IconTrash />, danger: true, onClick: done(() => void app.deleteEntry(path)) },
    );
    return (
      <MenuBox anchor={menu.anchor} align="right">
        <div className="truncate px-2.5 pt-1 pb-1.5 text-xs text-mute" title={path}>{name}{menu.isDir ? "/" : ""}</div>
        {items.map((it) => <Row key={it.id} it={it} />)}
      </MenuBox>
    );
  }

  if (menu.kind === "proj") {
    const favs = settings.s.favoriteProjects;
    return (
      <MenuBox anchor={menu.anchor} align="left">
        <div className="px-2.5 pt-1 pb-1 text-xs text-mute">ブックマーク</div>
        {favs.map((f) => (
          <Row
            key={f}
            it={{
              id: f,
              label: projectLabel(f, app.home),
              sub: tilde(f, app.home),
              icon: <IconBookmark />,
              on: p?.root === f,
              onClick: done(() => void app.openProject(f)),
              extra: (
                <span
                  role="button"
                  tabIndex={-1}
                  title="ブックマークから削除"
                  aria-label={`${projectLabel(f, app.home)}をブックマークから削除`}
                  className="grid size-5 place-items-center rounded hover:bg-bg"
                  onClick={(e) => (e.stopPropagation(), app.toggleFavorite(f))}
                >
                  <IconX />
                </span>
              ),
            }}
          />
        ))}
        {!favs.length && <div className="px-2.5 py-1.5 text-xs text-mute">フォルダの「…」から追加できます</div>}
        <hr className="my-1 border-line" />
        <Row it={{ id: "new", label: "新しいプロジェクト（~）", icon: <IconPlus />, onClick: done(() => void app.newProject()) }} />
      </MenuBox>
    );
  }

  const panels = settings.s.layout.panels;
  const labels = { projectTabs: "プロジェクトのタブ", list: "ファイル一覧", previewTabs: "プレビューのタブ", status: "フッター" } as const;
  return (
    <MenuBox anchor={menu.anchor} align="left">
      {(Object.keys(labels) as (keyof typeof labels)[]).map((k) => (
        <Row
          key={k}
          it={{
            id: k,
            label: labels[k],
            checked: panels[k],
            icon: <PanelIcon kind={k} on={panels[k]} />,
            onClick: () => settings.update((s) => ({ ...s, layout: { ...s.layout, panels: { ...s.layout.panels, [k]: !s.layout.panels[k] } } })),
          }}
        />
      ))}
    </MenuBox>
  );
}
