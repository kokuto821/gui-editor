import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Settings } from "../shared/protocol.js";

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  projects: [],
  favoriteProjects: [],
  layout: { listWidth: 300, panels: { projectTabs: true, list: true, previewTabs: true, status: true } },
};

export function settingsPath(): string {
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "cgui", "settings.json");
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/** 画面から来た値を、決まった形に整える（知らない項目は捨て、足りない項目は既定値にする）。 */
export function sanitize(raw: unknown): Settings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const lay = (r.layout && typeof r.layout === "object" ? r.layout : {}) as Record<string, unknown>;
  const pan = (lay.panels && typeof lay.panels === "object" ? lay.panels : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS.layout;
  const bool = (v: unknown, def: boolean) => (typeof v === "boolean" ? v : def);
  const width = typeof lay.listWidth === "number" && Number.isFinite(lay.listWidth) ? Math.max(0, Math.min(2000, lay.listWidth)) : d.listWidth;
  const projects = (Array.isArray(r.projects) ? r.projects : [])
    .map((p) => (p && typeof p === "object" ? (p as Record<string, unknown>) : null))
    .filter((p): p is Record<string, unknown> => !!p && typeof p.path === "string" && path.isAbsolute(p.path))
    .map((p) => ({ path: p.path as string, bookmarks: strings(p.bookmarks) }));
  return {
    version: 1,
    projects,
    favoriteProjects: strings(r.favoriteProjects).filter((p) => path.isAbsolute(p)),
    layout: {
      listWidth: width,
      panels: {
        projectTabs: bool(pan.projectTabs, d.panels.projectTabs),
        list: bool(pan.list, d.panels.list),
        previewTabs: bool(pan.previewTabs, d.panels.previewTabs),
        status: bool(pan.status, d.panels.status),
      },
    },
  };
}

export function loadSettings(): Settings {
  try {
    return sanitize(JSON.parse(fs.readFileSync(settingsPath(), "utf8")));
  } catch {
    return sanitize({});
  }
}

/** 一時ファイルに書いてから置き換える（書き込みの途中で壊れない）。 */
export function saveSettings(s: Settings): void {
  const file = settingsPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(s, null, 2) + "\n", { mode: 0o600 });
  fs.renameSync(tmp, file);
}
