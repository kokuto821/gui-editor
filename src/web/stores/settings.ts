import { create } from "zustand";
import type { Settings } from "../../shared/protocol";
import { backend } from "../backend";
import { DEFAULT_SETTINGS } from "../lib/settings-ops";

export * from "../lib/settings-ops";

interface SettingsState {
  s: Settings;
  load(): Promise<void>;
  update(fn: (s: Settings) => Settings): void;
}

let timer: ReturnType<typeof setTimeout> | null = null;

export const useSettings = create<SettingsState>()((set, get) => ({
  s: DEFAULT_SETTINGS,
  async load() {
    try {
      set({ s: await backend.call("settings.get", {}) });
    } catch {
      /* 既定値のまま使う */
    }
  },
  /** 画面にはすぐ反映し、保存は少しまとめてから行う。 */
  update(fn) {
    set({ s: fn(get().s) });
    timer ??= setTimeout(() => {
      timer = null;
      void backend.call("settings.set", { settings: get().s }).catch(() => {});
    }, 300);
  },
}));
