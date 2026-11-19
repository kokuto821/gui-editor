import { create } from "zustand";
import type { Entry } from "../../shared/protocol";
import { backend } from "../backend";
import { BackendError } from "../backend/types";
import { baseOf, dirOf, extOf, isInside, joinPath } from "../paths";
import { isDirty, useDocs } from "./docs";
import { useGit } from "./git";
import { bookmarksOf, isFavorite, projectLabel, useSettings, withBookmark, withMovedPaths } from "./settings";
import { useUi } from "./ui";

export const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg"]);
export const isImagePath = (p: string) => IMAGE_EXT.has(extOf(p));

export interface Project {
  root: string;
  cwd: string;
  /** フォルダ（絶対パス）ごとに、選んでいる名前を覚える */
  sel: Record<string, string>;
  side: "bm" | "files";
  view: "files" | "diff";
  /** プレビューのタブ。中身はファイルかフォルダの絶対パス（"" は、まだ何も選んでいない） */
  tabs: string[];
  tabIndex: number;
  bmSel: string | null;
  gfocus: "changes" | "commits";
  gi: { changes: number; commits: number };
  mode: Record<string, "view" | "edit">;
}

export interface Current {
  path: string;
  name: string;
  isDir: boolean;
}

interface State {
  ready: boolean;
  connected: boolean;
  home: string;
  projects: Project[];
  active: number;
  entries: Entry[];
  listError: string | null;
  pane: "list" | "preview";
  /** ファイルが外で変わるたびに増える。フォルダのプレビューなどが、これを見て読み直す */
  rev: number;
  /** 閉じたプロジェクトの状態（開き直すと、閉じる前に戻す） */
  stash: Record<string, Project>;

  init(): Promise<void>;
  setPane(p: "list" | "preview"): void;
  refresh(): Promise<void>;

  // 一覧の移動
  select(name: string): Promise<void>;
  selectBm(path: string): Promise<void>;
  move(delta: number): Promise<void>;
  jump(end: boolean): Promise<void>;
  enter(): Promise<void>;
  up(): Promise<void>;
  goRoot(): Promise<void>;
  navigateTo(path: string): Promise<void>;
  setSide(side: "bm" | "files"): Promise<void>;
  toggleView(): Promise<void>;
  setGitFocus(f: "changes" | "commits"): void;
  setGitIndex(i: number): void;

  // タブ
  openInNewTab(path: string): Promise<void>;
  dupTab(): Promise<void>;
  switchTab(i: number): Promise<void>;
  closeTab(i: number): Promise<void>;

  // 編集
  setMode(path: string, mode: "view" | "edit"): void;
  toggleMode(): void;
  saveCurrent(): Promise<void>;

  // プロジェクト
  switchProject(i: number): Promise<void>;
  openProject(path: string): Promise<void>;
  newProject(): Promise<void>;
  closeProject(i: number): Promise<boolean>;

  // ファイル操作
  toggleBookmark(path: string): void;
  toggleFavorite(path: string): void;
  renameEntry(path: string, name: string): Promise<boolean>;
  deleteEntry(path: string): Promise<void>;
  copyPath(path: string): Promise<void>;
}

const blank = (root: string): Project => ({
  root,
  cwd: root,
  sel: {},
  side: "files",
  view: "files",
  tabs: [""],
  tabIndex: 0,
  bmSel: null,
  gfocus: "changes",
  gi: { changes: 0, commits: 0 },
  mode: {},
});

/** 一覧の先頭に置く、1つ上のフォルダへ移る行の名前 */
export const UP = "..";

/** いまの選択（ファイルかフォルダ）。ブックマークの表示では、ブックマークの選択。 */
export function currentOf(p: Project | undefined, entries: Entry[]): Current | null {
  if (!p) return null;
  if (p.side === "bm") {
    const bms = bookmarksOf(useSettings.getState().s, p.root);
    const path = p.bmSel && bms.includes(p.bmSel) ? p.bmSel : bms[0];
    return path ? { path, name: baseOf(path), isDir: false } : null;
  }
  const e = entries.find((x) => x.name === p.sel[p.cwd]);
  if (e?.name === UP) return { path: dirOf(p.cwd), name: UP, isDir: true };
  return e ? { path: joinPath(p.cwd, e.name), name: e.name, isDir: e.kind === "dir" } : null;
}

/** プレビューに出しているファイル。フォルダは開かないので、フォルダを選んでいるときはアクティブなタブのファイル。 */
export function shownOf(p: Project | undefined, entries: Entry[]): Current | null {
  const c = currentOf(p, entries);
  if (!p || (c && !c.isDir)) return c;
  const path = p.tabs[p.tabIndex];
  return path ? { path, name: baseOf(path), isDir: false } : null;
}

/** 状態の中の、パスを持つ項目を、名前変更・削除（to が null）に合わせて直す。 */
function remap(p: Project, from: string, to: string | null): Project | null {
  const fix = (k: string): string | null => (k === from ? to : isInside(from, k) ? (to === null ? null : to + k.slice(from.length)) : k);
  const root = fix(p.root);
  if (root === null) return null; // プロジェクトのフォルダ自体が消えた
  const sel: Record<string, string> = {};
  for (const [dir, name] of Object.entries(p.sel)) {
    const nd = fix(dir);
    if (nd === null) continue;
    const moved = fix(joinPath(dir, name)); // 選んでいたものの名前を変えたなら、新しい名前にする
    sel[nd] = moved ? baseOf(moved) : name;
  }
  const tabs = p.tabs.map((t) => (t === "" ? "" : fix(t))).filter((t): t is string => t !== null);
  const mode: Project["mode"] = {};
  for (const [k, v] of Object.entries(p.mode)) {
    const nk = fix(k);
    if (nk) mode[nk] = v;
  }
  return {
    ...p,
    root,
    cwd: fix(p.cwd) ?? root,
    sel,
    tabs,
    tabIndex: Math.max(0, Math.min(p.tabIndex, tabs.length - 1)),
    bmSel: p.bmSel ? fix(p.bmSel) : null,
    mode,
  };
}

let seq = 0; // 古い応答で画面を上書きしないための番号

export const useApp = create<State>()((set, get) => {
  const project = () => get().projects[get().active];
  const patch = (fn: (p: Project) => Project) => {
    const { projects, active } = get();
    const p = projects[active];
    if (!p) return;
    const next = projects.slice();
    next[active] = fn(p);
    set({ projects: next });
  };
  const withSel = (p: Project, dir: string, name: string): Project => ({ ...p, sel: { ...p.sel, [dir]: name } });
  const cur = () => currentOf(project(), get().entries);
  const shown = () => shownOf(project(), get().entries);
  const canVisit = (p: Project, dir: string) => isInside(get().home, dir) || isInside(p.root, dir);
  const settings = () => useSettings.getState();

  /** 開いているタブの中身を、いまの選択に合わせる（一覧で選び直すと、アクティブなタブの中身が替わる）。 */
  let lastReplaced: { index: number; prev: string; path: string } | null = null;
  function syncTab() {
    const p = project();
    const c = cur();
    if (!p || !c || c.isDir || !p.tabs.length || p.tabs[p.tabIndex] === c.path) return;
    lastReplaced = { index: p.tabIndex, prev: p.tabs[p.tabIndex] ?? "", path: c.path };
    patch((q) => ({ ...q, tabs: q.tabs.map((t, i) => (i === q.tabIndex ? c.path : t)) }));
  }
  /** タブが0件のときに選び直したら、タブを1つ作る */
  function touch() {
    const p = project();
    if (p && !p.tabs.length) patch((q) => ({ ...q, tabs: [""], tabIndex: 0 }));
  }

  async function loadCurrent() {
    const c = shown();
    const p = project();
    if (!c || !p || !p.tabs.length) return;
    if (isImagePath(c.path)) return;
    await useDocs.getState().load(c.path);
  }

  async function refresh(): Promise<void> {
    const p = project();
    if (!p) return void set({ entries: [], listError: null });
    const my = ++seq;
    try {
      const { entries: listed } = await backend.call("fs.list", { dir: p.cwd });
      if (my !== seq) return;
      // 上へ移れるときは、先頭に「..」の行を置く
      const parent = dirOf(p.cwd);
      const entries: Entry[] = parent !== p.cwd && canVisit(p, parent) ? [{ name: UP, kind: "dir", size: 0, mtime: 0 }, ...listed] : listed;
      const want = project()?.sel[p.cwd];
      const name =
        entries.find((e) => e.name === want)?.name ??
        // はじめて開いたときは、計画（PLAN.md）があればそれを選ぶ
        (p.cwd === p.root && listed.some((e) => e.name === "PLAN.md") ? "PLAN.md" : listed[0]?.name);
      if (name && name !== want) patch((q) => withSel(q, q.cwd, name));
      set({ entries, listError: null });
      syncTab();
      await loadCurrent();
    } catch (e) {
      if (my !== seq) return;
      set({ entries: [], listError: e instanceof BackendError ? e.message : "読み込めませんでした" });
    }
  }

  let refreshTimer: ReturnType<typeof setTimeout> | null = null;
  const refreshSoon = () => {
    refreshTimer ??= setTimeout(() => {
      refreshTimer = null;
      void refresh();
    }, 80);
  };
  let gitTimer: ReturnType<typeof setTimeout> | null = null;
  const gitSoon = () => {
    gitTimer ??= setTimeout(() => {
      gitTimer = null;
      const p = project();
      if (p) void useGit.getState().refresh(p.root).then(() => p.view === "diff" && reloadDiff());
    }, 250);
  };
  function reloadDiff() {
    const p = project();
    if (!p || p.view !== "diff") return;
    const repo = useGit.getState().repos[p.root];
    if (!repo) return;
    const i = p.gi[p.gfocus];
    if (p.gfocus === "changes") void useGit.getState().loadDiff(p.root, repo.files[i] ? { path: repo.files[i]!.path } : null);
    else void useGit.getState().loadDiff(p.root, repo.commits[i] ? { hash: repo.commits[i]!.hash } : null);
  }

  /** 最初に開いたプロジェクトは、PLAN.md をブックマークしておく。 */
  async function ensureDefaultBookmark(root: string) {
    const s = settings().s;
    if (s.projects.some((p) => p.path === root)) return;
    try {
      const { entries } = await backend.call("fs.list", { dir: root });
      const plan = entries.some((e) => e.name === "PLAN.md");
      settings().update((x) => (x.projects.some((p) => p.path === root) ? x : { ...x, projects: [...x.projects, { path: root, bookmarks: plan ? ["PLAN.md"] : [] }] }));
    } catch {
      /* 読めなければ、何もしない */
    }
  }

  function addProject(path: string, activate: boolean) {
    let { projects } = get();
    let i = projects.findIndex((p) => p.root === path);
    if (i < 0) {
      const restored = get().stash[path];
      projects = [...projects, restored ?? blank(path)];
      i = projects.length - 1;
      set({ projects });
      void ensureDefaultBookmark(path);
    }
    if (activate) void get().switchProject(i);
  }

  async function navigate(path: string) {
    const p = project();
    if (!p || !canVisit(p, path)) return;
    const dir = dirOf(path);
    const bookmarked = p.side === "bm" && bookmarksOf(settings().s, p.root).includes(path);
    patch((q) =>
      bookmarked
        ? { ...q, view: "files", bmSel: path }
        : { ...withSel(q, dir, baseOf(path)), cwd: dir, side: "files", view: "files" },
    );
    if (bookmarked) {
      await loadCurrent();
    } else await refresh();
  }

  async function closeProjectAt(i: number): Promise<boolean> {
    const p = get().projects[i];
    if (!p) return true;
    const dirty = Object.values(useDocs.getState().docs).filter((d) => isDirty(d) && isInside(p.root, d.path));
    if (dirty.length) {
      const r = await useUi.getState().ask(`${projectLabel(p.root, get().home)} に、保存していない変更が ${dirty.length} 件あります。`, [
        { id: "cancel", label: "キャンセル" },
        { id: "discard", label: "破棄して閉じる" },
        { id: "save", label: "保存して閉じる", primary: true },
      ]);
      if (r === "cancel") return false;
      for (const d of dirty) {
        if (r === "save") await useDocs.getState().save(d.path);
        else useDocs.getState().discard(d.path);
      }
    }
    const projects = get().projects.filter((_, j) => j !== i);
    set({
      projects,
      stash: { ...get().stash, [p.root]: p },
      active: Math.max(0, Math.min(get().active > i ? get().active - 1 : get().active, projects.length - 1)),
    });
    void backend.call("project.close", { path: p.root }).catch(() => {});
    set({ entries: [], pane: "list" });
    await refresh();
    return true;
  }

  return {
    ready: false,
    connected: false,
    home: "/",
    projects: [],
    active: 0,
    entries: [],
    listError: null,
    pane: "list",
    rev: 0,
    stash: {},

    async init() {
      backend.onStatus((connected) => {
        set({ connected });
        if (connected && get().ready) void refresh();
      });
      backend.onEvent((ev) => {
        if (ev.event === "project.open") addProject(ev.path, true);
        else if (ev.event === "fs.changed") {
          set({ rev: get().rev + 1 });
          void useDocs.getState().onChanged(ev.paths);
          if (project()?.root === ev.root) {
            refreshSoon();
            gitSoon();
          }
        } else if (ev.event === "git.changed" && project()?.root === ev.root) gitSoon();
      });
      // ほかのウィンドウで作業して戻ったときも、最新にする（ホームは監視していないため）
      window.addEventListener("focus", () => {
        if (get().ready) (refreshSoon(), gitSoon());
      });
      const hello = await backend.call("hello", {});
      backend.setPreviewPort(hello.previewPort);
      await useSettings.getState().load();
      set({ home: hello.home, projects: hello.projects.map(blank), ready: true });
      hello.projects.forEach((r) => void ensureDefaultBookmark(r));
      await refresh();
      const p = project();
      if (p) void useGit.getState().refresh(p.root);
    },

    setPane: (pane) => set({ pane }),
    refresh,

    async select(name) {
      const p = project();
      // 同じものを選び直しても、タブが0件なら、タブを作って表示する
      if (!p || (p.sel[p.cwd] === name && p.tabs.length)) return;
      // フォルダは開かない: 一覧で選ぶだけで、タブとプレビューはそのまま
      if (get().entries.find((e) => e.name === name)?.kind === "dir") return patch((q) => withSel(q, q.cwd, name));
      touch();
      patch((q) => withSel(q, q.cwd, name));
      syncTab();
      await loadCurrent();
    },

    async selectBm(path) {
      const p = project();
      if (!p || (p.bmSel === path && p.tabs.length)) return;
      touch();
      patch((q) => ({ ...q, bmSel: path }));
      syncTab();
      await loadCurrent();
    },

    async move(delta) {
      const p = project();
      if (!p) return;
      if (p.side === "bm") {
        const bms = bookmarksOf(settings().s, p.root);
        if (!bms.length) return;
        const i = Math.max(0, bms.indexOf(cur()?.path ?? ""));
        return get().selectBm(bms[Math.max(0, Math.min(bms.length - 1, i + delta))]!);
      }
      const { entries } = get();
      if (!entries.length) return;
      const i = Math.max(0, entries.findIndex((e) => e.name === p.sel[p.cwd]));
      const next = entries[Math.max(0, Math.min(entries.length - 1, i + delta))];
      if (next) await get().select(next.name);
    },

    async jump(end) {
      const p = project();
      if (!p) return;
      if (p.side === "bm") {
        const bms = bookmarksOf(settings().s, p.root);
        const t = end ? bms[bms.length - 1] : bms[0];
        return t ? get().selectBm(t) : undefined;
      }
      const { entries } = get();
      const t = end ? entries[entries.length - 1] : entries[0];
      if (t) await get().select(t.name);
    },

    async enter() {
      const p = project();
      const c = cur();
      if (!p || p.side !== "files" || !c?.isDir) return;
      if (c.name === UP) return get().up();
      patch((q) => ({ ...q, cwd: c.path }));
      await refresh();
    },

    async up() {
      const p = project();
      if (!p || p.side !== "files") return;
      const parent = dirOf(p.cwd);
      if (parent === p.cwd || !canVisit(p, parent)) return;
      const from = baseOf(p.cwd);
      patch((q) => ({ ...withSel(q, parent, from), cwd: parent }));
      await refresh();
    },

    async goRoot() {
      const p = project();
      if (!p) return;
      patch((q) => ({ ...q, view: "files", side: "files", cwd: q.root }));
      set({ pane: "list" });
      touch();
      await refresh();
    },

    navigateTo: navigate,

    async setSide(side) {
      const p = project();
      if (!p) return;
      patch((q) => ({ ...q, side, view: "files" }));
      touch();
      syncTab();
      await loadCurrent();
    },

    async toggleView() {
      const p = project();
      if (!p) return;
      if (p.view === "diff") {
        patch((q) => ({ ...q, view: "files" }));
        return;
      }
      patch((q) => ({ ...q, view: "diff" }));
      await useGit.getState().refresh(p.root);
      reloadDiff();
    },

    setGitFocus(f) {
      patch((q) => ({ ...q, gfocus: f }));
      reloadDiff();
    },
    setGitIndex(i) {
      patch((q) => ({ ...q, gi: { ...q.gi, [q.gfocus]: i } }));
      reloadDiff();
    },

    async openInNewTab(path) {
      const p = project();
      if (!p) return;
      // 1回目のクリックで、アクティブなタブの中身が替わっている。それを元に戻してから、新しいタブで開く
      const lr = lastReplaced;
      let tabs = p.tabs.slice();
      if (lr && lr.path === path && tabs[lr.index] === path && lr.prev) tabs[lr.index] = lr.prev;
      const other = tabs.findIndex((t, i) => t === path && i !== lr?.index);
      let index: number;
      if (other >= 0) index = other;
      else {
        index = Math.min(tabs.length, p.tabIndex + 1);
        tabs = [...tabs.slice(0, index), path, ...tabs.slice(index)];
      }
      patch((q) => ({ ...q, tabs, tabIndex: index }));
      await loadCurrent();
    },

    async dupTab() {
      const p = project();
      const c = shown();
      if (!p || !c) return;
      patch((q) => ({ ...q, tabs: [...q.tabs.slice(0, q.tabIndex + 1), c.path, ...q.tabs.slice(q.tabIndex + 1)], tabIndex: q.tabIndex + 1 }));
    },

    async switchTab(i) {
      const p = project();
      const path = p?.tabs[i];
      if (!p || path === undefined) return;
      patch((q) => ({ ...q, tabIndex: i }));
      if (path) await navigate(path);
    },

    async closeTab(i) {
      const p = project();
      const path = p?.tabs[i];
      if (!p || path === undefined) return;
      const doc = useDocs.getState().docs[path];
      const elsewhere = p.tabs.some((t, j) => j !== i && t === path);
      if (isDirty(doc) && !elsewhere) {
        const r = await useUi.getState().ask(`${baseOf(path)} の変更は保存されていません。`, [
          { id: "cancel", label: "キャンセル" },
          { id: "discard", label: "破棄" },
          { id: "save", label: "保存", primary: true },
        ]);
        if (r === "cancel") return;
        if (r === "save") {
          if ((await useDocs.getState().save(path)) !== "ok") return; // 保存できなければ、閉じない
        } else useDocs.getState().discard(path);
      }
      const q = project();
      if (!q) return;
      const tabs = q.tabs.filter((_, j) => j !== i);
      let idx = q.tabIndex;
      if (i < q.tabIndex) idx--;
      else if (i === q.tabIndex) idx = Math.min(i, tabs.length - 1);
      if (!tabs.length) idx = 0;
      patch((x) => ({ ...x, tabs, tabIndex: idx }));
      if (tabs.length && i === q.tabIndex && tabs[idx]) await navigate(tabs[idx]!);
    },

    setMode(path, mode) {
      patch((q) => ({ ...q, mode: { ...q.mode, [path]: mode } }));
      set({ pane: mode === "edit" ? "preview" : "list" });
    },

    toggleMode() {
      const c = shown();
      const p = project();
      if (!c || !p || c.isDir || !p.tabs.length) return;
      const doc = useDocs.getState().docs[c.path];
      if (!doc) return; // テキストでないものは、編集に入れない
      get().setMode(c.path, (p.mode[c.path] ?? "view") === "edit" ? "view" : "edit");
    },

    async saveCurrent() {
      const c = shown();
      if (!c) return;
      const doc = useDocs.getState().docs[c.path];
      if (!isDirty(doc)) return;
      const r = await useDocs.getState().save(c.path);
      if (r === "conflict") useUi.getState().say("外で書き換えられています。上の表示から選んでください");
      else if (r === "error") useUi.getState().say("保存できませんでした");
    },

    async switchProject(i) {
      if (i < 0 || i >= get().projects.length) return;
      set({ active: i, entries: [], pane: "list" });
      await refresh();
      const p = project();
      if (p) {
        await useGit.getState().refresh(p.root);
        reloadDiff();
      }
    },

    async openProject(path) {
      const i = get().projects.findIndex((p) => p.root === path);
      if (i >= 0) return get().switchProject(i);
      try {
        await backend.call("project.open", { path }); // 通知（project.open）が戻ってきて、タブが増える
        addProject(path, true);
      } catch (e) {
        useUi.getState().say(e instanceof BackendError ? e.message : "開けませんでした");
      }
    },

    newProject: () => get().openProject(get().home),

    closeProject: closeProjectAt,

    toggleBookmark(path) {
      const p = project();
      if (!p) return;
      const on = !bookmarksOf(settings().s, p.root).includes(path);
      settings().update((s) => withBookmark(s, p.root, path, on));
    },

    toggleFavorite(path) {
      settings().update((s) => ({
        ...s,
        favoriteProjects: isFavorite(s, path) ? s.favoriteProjects.filter((x) => x !== path) : [...s.favoriteProjects, path],
      }));
    },

    async renameEntry(path, name) {
      const ui = useUi.getState();
      if (!name || baseOf(path) === name) return true;
      try {
        const { path: to } = await backend.call("fs.rename", { path, name });
        const projects = get().projects.map((p) => remap(p, path, to) ?? p);
        set({ projects });
        useDocs.getState().moved(path, to);
        settings().update((s) => withMovedPaths(s, path, to));
        // プロジェクトのフォルダ自体の名前を変えたときは、サーバーの側も付け替える
        for (const p of get().projects) if (p.root === to) void backend.call("project.close", { path }).then(() => backend.call("project.open", { path: to })).catch(() => {});
        await refresh();
        return true;
      } catch (e) {
        ui.say(e instanceof BackendError ? e.message : "名前を変えられませんでした");
        return false;
      }
    },

    async deleteEntry(path) {
      const ui = useUi.getState();
      const isDir = get().entries.some((e) => joinPath(project()?.cwd ?? "", e.name) === path && e.kind === "dir");
      const hit = get().projects.filter((p) => isInside(path, p.root));
      const dirty = Object.values(useDocs.getState().docs).filter((d) => isDirty(d) && isInside(path, d.path));
      let msg = isDir ? `${baseOf(path)}/ と中のファイルをすべて削除しますか？` : `${baseOf(path)} を削除しますか？`;
      if (dirty.length) msg += `\n（保存していない変更が ${dirty.length} 件あります。変更も失われます）`;
      if (hit.length) msg += `\n（このフォルダを開いているプロジェクト「${hit.map((p) => projectLabel(p.root, get().home)).join("」「")}」も閉じます）`;
      if ((await ui.ask(msg, [{ id: "cancel", label: "キャンセル" }, { id: "del", label: "削除", primary: true }])) !== "del") return;
      try {
        await backend.call("fs.delete", { path });
      } catch (e) {
        return ui.say(e instanceof BackendError ? e.message : "削除できませんでした");
      }
      const rest = get().projects.filter((p) => !isInside(path, p.root));
      for (const p of get().projects) if (isInside(path, p.root)) void backend.call("project.close", { path: p.root }).catch(() => {});
      const active = project()?.root;
      const projects = rest.map((p) => remap(p, path, null) ?? p);
      set({ projects, active: Math.max(0, projects.findIndex((p) => p.root === active)) });
      useDocs.getState().moved(path, null);
      settings().update((s) => withMovedPaths(s, path, null));
      set({ entries: [] });
      await refresh();
    },

    async copyPath(path) {
      try {
        await navigator.clipboard.writeText(path);
        useUi.getState().say("パスをコピーしました");
      } catch {
        window.prompt("パスをコピー", path);
      }
    },
  };
});

export const useProject = () => useApp((s) => s.projects[s.active]);
