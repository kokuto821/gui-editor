import type { ReactNode } from "react";

const base = { viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, className: "size-4" } as const;
const Svg = ({ children, className }: { children: ReactNode; className?: string }) => (
  <svg {...base} className={className ?? base.className}>
    {children}
  </svg>
);

export const IconPlus = () => <Svg><path d="M8 3v10M3 8h10" /></Svg>;
export const IconX = () => <Svg><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" /></Svg>;
export const IconEye = () => <Svg><path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" /><circle cx="8" cy="8" r="2" /></Svg>;
export const IconPencil = () => <Svg><path d="M10.5 2.5l3 3L6 13H3v-3z" /></Svg>;
export const IconSave = () => <Svg><path d="M2.5 2.5h9l2 2v9h-11z" /><path d="M5 2.5v3.5h5.5V2.5M4.5 13.5V9.5h7v4" /></Svg>;
export const IconHome = () => <Svg><path d="M2.5 7.5L8 3l5.5 4.5M4 6.5V13h8V6.5" /></Svg>;
export const IconLayout = () => <Svg><rect x="2" y="2.5" width="12" height="11" rx="1.5" /><path d="M2 6h12M6 6v7.5" /></Svg>;
export const IconBookmark = () => <Svg><path d="M4 2.5h8v11l-4-3-4 3z" /></Svg>;
export const IconFile = () => <Svg><path d="M4 1.5h5l3 3v10H4z" /><path d="M9 1.5v3h3" /></Svg>;
export const IconFolder = () => <Svg><path d="M2 4.5V12.5h12V6H7.5L6 4.5z" /></Svg>;
export const IconGit = () => <Svg><circle cx="5" cy="3.8" r="1.6" /><circle cx="5" cy="12.2" r="1.6" /><circle cx="11" cy="6" r="1.6" /><path d="M5 5.4v5.2M11 7.6c0 2.2-2 3-5 3.6" /></Svg>;
export const IconRename = () => <Svg><path d="M6 3h4M6 13h4M8 3v10" /></Svg>;
export const IconCopy = () => <Svg><rect x="5.5" y="5.5" width="8" height="8" rx="1.5" /><path d="M10.5 5.5V3.5a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2" /></Svg>;
export const IconSearch = () => <Svg><circle cx="7" cy="7" r="4.2" /><path d="M10.2 10.2L14 14" /></Svg>;
export const IconChevronUp = () => <Svg><path d="M4 10l4-4 4 4" /></Svg>;
export const IconChevronDown = () => <Svg><path d="M4 6l4 4 4-4" /></Svg>;
export const IconTrash = () => <Svg><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 9h5.6l.7-9" /></Svg>;
export const IconMore = () => (
  <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden className="size-4">
    <circle cx="3.5" cy="8" r="1.3" /><circle cx="8" cy="8" r="1.3" /><circle cx="12.5" cy="8" r="1.3" />
  </svg>
);

/** 表示するパネルのメニュー用: 塗っていれば表示中、点線なら非表示 */
export function PanelIcon({ kind, on }: { kind: "projectTabs" | "list" | "previewTabs" | "status"; on: boolean }) {
  const fill = on ? "currentColor" : "none";
  const dash = on ? undefined : "2 1.6";
  const r = { fill, fillOpacity: on ? 0.28 : 0, strokeDasharray: dash } as const;
  return (
    <svg {...base}>
      <rect x="2" y="2.5" width="12" height="11" rx="1.5" strokeDasharray={undefined} />
      {kind === "projectTabs" && <rect x="2" y="2.5" width="12" height="3" rx="1" {...r} />}
      {kind === "list" && <rect x="2" y="5.5" width="4" height="8" {...r} />}
      {kind === "previewTabs" && <rect x="6" y="5.5" width="8" height="2.6" {...r} />}
      {kind === "status" && <rect x="2" y="11" width="12" height="2.5" rx="1" {...r} />}
    </svg>
  );
}
