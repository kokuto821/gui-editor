import { create } from "zustand";
import type { Entry, ReadResult } from "../../shared/protocol";
import { type Backend, BackendError } from "../backend/types";
import { baseOf, dirOf, isInside, joinPath } from "../paths";

export interface Project {
  root: string;
  cwd: string;
  /** フォルダごとに、選んでいる名前を覚える */
  sel: Record<string, string>;
}

export type Preview =
  | { kind: "none" }
  | { kind: "dir"; path: string; entries: Entry[] }
  | { kind: "file"; path: string; result: ReadResult }
  | { kind: "error"; path: string; message: string };

interface State {
  ready: boolean;
  connected: boolean;
  home: string;
  projects: Project[];
  active: number;
  entries: Entry[];
  preview: Preview;
  error: string | null;
  pane: "list" | "preview";
  init(backend: Backend): Promise<void>;
  setPane(p: "list" | "preview"): void;
  switchProject(i: number): Promise<void>;
  closeProject(i: number): Promise<void>;
  select(name: string): Promise<void>;
  move(delta: number): Promise<void>;
  jump(end: boolean): Promise<void>;
  enter(): Promise<void>; // → : フォルダの中へ
  up(): Promise<void>; // ← : 親のフォルダへ
  goTo(path: string): Promise<void>;
}

let backend: Backend;
let seq = 0; // 古い応答で画面を上書きしないための番号

export const useApp = create<State>()((set, get) => {
  const project = () => get().projects[get().active];
  /** 選んでいるプロジェクトを、新しいオブジェクトに置き換える（React が変更に気づけるように、直接は書き換えない） */
  const patch = (fn: (p: Project) => Project) => {
    const { projects, active } = get();
    const p = projects[active];
    if (!p) return;
    const next = projects.slice();
    next[active] = fn(p);
    set({ projects: next });
  };
  const withSel = (p: Project, dir: string, name: string): Project => ({ ...p, sel: { ...p.sel, [dir]: name } });

  const canVisit = (p: Project, dir: string) => isInside(get().home, dir) || isInside(p.root, dir);
  const selectedName = (p: Project, entries: Entry[]) => {
    const want = p.sel[p.cwd];
    const found = entries.find((e) => e.name === want)?.name;
    // はじめてプロジェクトを開いたときは、計画（PLAN.md）があればそれを選ぶ
    if (!found && p.cwd === p.root && entries.some((e) => e.name === "PLAN.md")) return "PLAN.md";
    return found ?? entries[0]?.name;
  };

  /** 今のフォルダの一覧と、選んでいる項目のプレビューを読み直す。 */
  async function refresh(): Promise<void> {
    const p = project();
    if (!p) return;
    const my = ++seq;
    try {
      const { entries } = await backend.call("fs.list", { dir: p.cwd });
      if (my !== seq) return;
      const name = selectedName(p, entries);
      if (name && p.sel[p.cwd] !== name) patch((q) => withSel(q, q.cwd, name));
      set({ entries, error: null });
      await loadPreview(my);
    } catch (e) {
      if (my !== seq) return;
      set({ entries: [], preview: { kind: "none" }, error: e instanceof BackendError ? e.message : "読み込めませんでした" });
    }
  }

  async function loadPreview(my = seq): Promise<void> {
    const p = project();
    if (!p) return;
    const name = p.sel[p.cwd];
    const entry = get().entries.find((e) => e.name === name);
    if (!entry) return void set({ preview: { kind: "none" } });
    const path = joinPath(p.cwd, entry.name);
    try {
      let preview: Preview;
      if (entry.kind === "dir") preview = { kind: "dir", path, entries: (await backend.call("fs.list", { dir: path })).entries };
      else preview = { kind: "file", path, result: await backend.call("fs.read", { path }) };
      if (my === seq) set({ preview });
    } catch (e) {
      if (my === seq) set({ preview: { kind: "error", path, message: e instanceof BackendError ? e.message : "読み込めませんでした" } });
    }
  }

  let timer: ReturnType<typeof setTimeout> | null = null;
  const refreshSoon = () => {
    timer ??= setTimeout(() => {
      timer = null;
      void refresh();
    }, 80);
  };

  function addProject(path: string, activate: boolean): void {
    let { projects } = get();
    let i = projects.findIndex((p) => p.root === path);
    if (i < 0) {
      projects = [...projects, { root: path, cwd: path, sel: {} }];
      i = projects.length - 1;
      set({ projects });
    }
    if (activate) void get().switchProject(i);
  }

  return {
    ready: false,
    connected: false,
    home: "/",
    projects: [],
    active: 0,
    entries: [],
    preview: { kind: "none" },
    error: null,
    pane: "list",

    async init(b) {
      backend = b;
      b.onStatus((connected) => {
        set({ connected });
        if (connected && get().ready) void refresh(); // つなぎ直したら読み直す
      });
      b.onEvent((ev) => {
        if (ev.event === "project.open") addProject(ev.path, true);
        else if (ev.event === "fs.changed" && project()?.root === ev.root) refreshSoon();
      });
      const hello = await b.call("hello", {});
      set({ home: hello.home, projects: hello.projects.map((root) => ({ root, cwd: root, sel: {} })), ready: true });
      await refresh();
    },

    setPane: (pane) => set({ pane }),

    async switchProject(i) {
      set({ active: i, entries: [], preview: { kind: "none" } });
      await refresh();
    },

    async closeProject(i) {
      const projects = get().projects.filter((_, j) => j !== i);
      set({ projects, active: Math.max(0, Math.min(get().active, projects.length - 1)) });
      await refresh();
    },

    async select(name) {
      const p = project();
      if (!p || p.sel[p.cwd] === name) return;
      patch((q) => withSel(q, q.cwd, name));
      await loadPreview(++seq);
    },

    async move(delta) {
      const { entries } = get();
      const p = project();
      if (!p || !entries.length) return;
      const i = Math.max(0, entries.findIndex((e) => e.name === p.sel[p.cwd]));
      const next = entries[Math.max(0, Math.min(entries.length - 1, i + delta))];
      if (next) await get().select(next.name);
    },

    async jump(end) {
      const { entries } = get();
      const target = end ? entries[entries.length - 1] : entries[0];
      if (target) await get().select(target.name);
    },

    async enter() {
      const p = project();
      const name = p?.sel[p.cwd];
      const e = get().entries.find((x) => x.name === name);
      if (!p || !e || e.kind !== "dir") return;
      const child = joinPath(p.cwd, e.name);
      patch((q) => ({ ...q, cwd: child }));
      await refresh();
    },

    async up() {
      const p = project();
      if (!p) return;
      const parent = dirOf(p.cwd);
      if (parent === p.cwd || !canVisit(p, parent)) return;
      const from = baseOf(p.cwd);
      patch((q) => ({ ...withSel(q, parent, from), cwd: parent }));
      await refresh();
    },

    async goTo(path) {
      const p = project();
      if (!p || !canVisit(p, path)) return;
      const dir = dirOf(path);
      patch((q) => ({ ...withSel(q, dir, baseOf(path)), cwd: dir }));
      set({ pane: "list" });
      await refresh();
    },
  };
});

export const useProject = () => useApp((s) => s.projects[s.active]);
