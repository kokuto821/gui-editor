import { create } from "zustand";
import type { Commit, GitFile } from "../../shared/protocol";
import { backend } from "../backend";

export interface DiffState {
  key: string;
  loading: boolean;
  patch: string;
  truncated: boolean;
  error: boolean;
}

interface GitState {
  repos: Record<string, { isRepo: boolean; files: GitFile[]; commits: Commit[] }>;
  diff: DiffState | null;
  refresh(root: string, withLog?: boolean): Promise<void>;
  /** path か hash のどちらかを指定して、差分を読む。同じキーの読み込み中の古い応答は捨てる */
  loadDiff(root: string, target: { path?: string; hash?: string } | null): Promise<void>;
}

let diffSeq = 0;

export const useGit = create<GitState>()((set, get) => ({
  repos: {},
  diff: null,

  async refresh(root, withLog = true) {
    try {
      const st = await backend.call("git.status", { root });
      const commits = st.isRepo && withLog ? (await backend.call("git.log", { root })).commits : (get().repos[root]?.commits ?? []);
      set((s) => ({ repos: { ...s.repos, [root]: { isRepo: st.isRepo, files: st.files, commits } } }));
    } catch {
      /* 取れなければ、前の状態のまま */
    }
  },

  async loadDiff(root, target) {
    const my = ++diffSeq;
    if (!target || (!target.path && !target.hash)) return void set({ diff: null });
    const key = target.hash ? `c:${target.hash}` : `f:${target.path}`;
    const prev = get().diff;
    set({ diff: { key, loading: prev?.key !== key, patch: prev?.key === key ? prev.patch : "", truncated: false, error: false } });
    try {
      const r = await backend.call("git.diff", { root, ...target });
      if (my === diffSeq) set({ diff: { key, loading: false, patch: r.patch, truncated: r.truncated, error: false } });
    } catch {
      if (my === diffSeq) set({ diff: { key, loading: false, patch: "", truncated: false, error: true } });
    }
  },
}));
