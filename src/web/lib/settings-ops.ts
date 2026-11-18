import type { Settings } from "../../shared/protocol";
import { baseOf, isInside } from "../paths";

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  projects: [],
  favoriteProjects: [],
  layout: { listWidth: 300, panels: { projectTabs: true, list: true, previewTabs: true, status: true } },
};

// --- 設定の読み書きの部品（ストアの外から使える純粋な関数） ---

/** プロジェクトのブックマーク（プロジェクトからの相対パス → 絶対パス） */
export const bookmarksOf = (s: Settings, root: string): string[] =>
  (s.projects.find((p) => p.path === root)?.bookmarks ?? []).map((r) => `${root}/${r}`);

const rel = (root: string, abs: string) => abs.slice(root.length + 1);

export function withBookmark(s: Settings, root: string, abs: string, on: boolean): Settings {
  if (!isInside(root, abs) || abs === root) return s;
  const r = rel(root, abs);
  const cur = s.projects.find((p) => p.path === root)?.bookmarks ?? [];
  const next = on ? (cur.includes(r) ? cur : [...cur, r]) : cur.filter((x) => x !== r);
  const others = s.projects.filter((p) => p.path !== root);
  return { ...s, projects: [...others, { path: root, bookmarks: next }] };
}

/** 名前変更・削除に合わせて、ブックマークのパスを直す（from の下にあるものすべて。to が null なら消す） */
export function withMovedPaths(s: Settings, from: string, to: string | null): Settings {
  const fix = (abs: string): string | null =>
    abs === from ? to : isInside(from, abs) ? (to === null ? null : to + abs.slice(from.length)) : abs;
  const projects = s.projects.map((p) => {
    const next = p.bookmarks
      .map((r) => fix(`${p.path}/${r}`))
      .filter((a): a is string => a !== null && isInside(p.path, a) && a !== p.path)
      .map((a) => rel(p.path, a));
    return { ...p, bookmarks: next };
  });
  const fav = s.favoriteProjects.map((f) => fix(f)).filter((f): f is string => f !== null);
  return { ...s, projects, favoriteProjects: fav };
}

export const isFavorite = (s: Settings, path: string) => s.favoriteProjects.includes(path);
export const projectLabel = (path: string, home: string) => (path === home ? "~" : baseOf(path) || "/");
