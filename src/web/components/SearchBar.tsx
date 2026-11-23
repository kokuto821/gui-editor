import clsx from "clsx";
import type { ReactNode } from "react";
import type { SearchOpts } from "../../shared/match";
import { useSearch } from "../stores/search";
import { IconChevronDown, IconChevronUp } from "./Icons";

// 検索の入力欄の横のボタン。見た目と記号は、CodeMirror の検索パネル（hooks/findPanel.ts）にそろえる

export function BarButton({ label, pressed, onClick, children }: { label: string; pressed?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      tabIndex={-1}
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      onMouseDown={(e) => e.preventDefault()} // 入力欄のフォーカスを奪わない
      onClick={onClick}
      className={clsx("grid size-6 flex-none place-items-center rounded font-mono text-[11px] font-semibold hover:bg-soft hover:text-ink [&_svg]:size-3.5", pressed ? "bg-soft text-ink" : "text-mute")}
    >
      {children}
    </button>
  );
}

const FLAGS: { key: keyof SearchOpts; glyph: string; label: string }[] = [
  { key: "caseSensitive", glyph: "Aa", label: "大文字小文字を区別" },
  { key: "wholeWord", glyph: "ab", label: "単語単位" },
  { key: "regexp", glyph: ".*", label: "正規表現" },
];

/** 大文字小文字・単語単位・正規表現の切替。本文検索・クイックオープン・ページ内検索で同じ設定を使う */
export function OptionToggles() {
  const opts = useSearch((s) => s.opts);
  const setOpts = useSearch((s) => s.setOpts);
  return (
    <span className="flex flex-none items-center gap-0.5">
      {FLAGS.map((f) => (
        <BarButton key={f.key} label={f.label} pressed={opts[f.key]} onClick={() => setOpts({ ...opts, [f.key]: !opts[f.key] })}>
          {f.glyph}
        </BarButton>
      ))}
    </span>
  );
}

/** keys は、ツールチップに出すキー（前へ・次へ） */
export function StepButtons({ onPrev, onNext, keys = ["Shift+Enter", "Enter"] }: { onPrev: () => void; onNext: () => void; keys?: [string, string] }) {
  return (
    <span className="flex flex-none items-center gap-0.5">
      <BarButton label={`前へ（${keys[0]}）`} onClick={onPrev}>
        <IconChevronUp />
      </BarButton>
      <BarButton label={`次へ（${keys[1]}）`} onClick={onNext}>
        <IconChevronDown />
      </BarButton>
    </span>
  );
}
