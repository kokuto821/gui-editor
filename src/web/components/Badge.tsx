import clsx from "clsx";
import { extOf } from "../paths";

/** 記号（▸ ▾ ·）は小さいと見えないので、拡張子の文字より大きく */
const GLYPH = "flex-none font-mono text-[13px] leading-none text-mute";

/** フォルダの ▸。open なら ▾（検索結果の開閉） */
export const Chevron = ({ open = false, className }: { open?: boolean; className?: string }) => <span className={clsx(GLYPH, className)}>{open ? "▾" : "▸"}</span>;

/** 行の頭の、ファイルの種類（拡張子の先頭4文字。なければ ·） */
export function ExtBadge({ name, className = "w-9" }: { name: string; className?: string }) {
  const ext = extOf(name).slice(0, 4);
  return <span className={clsx(className, ext ? "flex-none font-mono text-[9px] text-mute uppercase" : GLYPH)}>{ext || "·"}</span>;
}
