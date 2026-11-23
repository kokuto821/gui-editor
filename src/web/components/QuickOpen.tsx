import clsx from "clsx";
import { useEffect, useMemo, useRef, useState } from "react";
import { buildMatcher, matchesIn } from "../../shared/match";
import { isInside } from "../paths";
import { useApp, useProject } from "../stores/app";
import { useSearch } from "../stores/search";
import { badgeCls, extBadge } from "./FileList";
import { OptionToggles, StepButtons } from "./SearchBar";

/** ql の文字が、s の from 以降にこの順で現れる位置（現れなければ null） */
function subseq(ql: string, s: string, from: number): number[] | null {
  const idx: number[] = [];
  let j = from;
  for (let i = 0; i < ql.length; i++) {
    j = s.indexOf(ql.charAt(i), j);
    if (j < 0) return null;
    idx.push(j);
    j++;
  }
  return idx;
}

/** 連続した一致・単語の頭・ファイル名の中の一致を高くし、パスが短いほど高くする */
function fuzzy(q: string, rel: string): { score: number; idx: number[] } | null {
  const s = rel.toLowerCase();
  const ql = q.toLowerCase().replace(/\s+/g, "");
  const bs = rel.lastIndexOf("/") + 1;
  let idx = subseq(ql, s, bs);
  const inBase = !!idx;
  if (!idx) idx = subseq(ql, s, 0);
  if (!idx) return null;
  let sc = inBase ? 40 : 0;
  idx.forEach((k, n) => {
    const prev = k ? s.charAt(k - 1) : "/";
    const before = n ? idx![n - 1] : undefined;
    if (before !== undefined && k === before + 1) sc += 8;
    if ("/._- ".includes(prev)) sc += 6;
    if (k === bs) sc += 10;
  });
  const first = idx[0] ?? 0;
  const last = idx[idx.length - 1] ?? 0;
  return { score: sc - rel.length * 0.2 - (last - first) * 0.3, idx };
}

/** 大文字小文字・単語単位・正規表現のどれかを ON にしたとき: パス全体での一致。順位は付けない（パスの順に並ぶ） */
function exact(re: RegExp, rel: string): { score: number; idx: number[] } | null {
  const idx = [...matchesIn(re, rel)].flatMap((r) => Array.from({ length: r.to - r.from }, (_, k) => r.from + k));
  return idx.length ? { score: 0, idx } : null;
}

/** rel の中の idx（絶対位置）に <mark> を付ける。off は、渡した文字列が rel の何文字目から始まるか */
function Marked({ text, off, idx }: { text: string; off: number; idx: number[] }) {
  const on = new Set(idx.map((k) => k - off));
  return (
    <>
      {text.split("").map((ch, i) =>
        on.has(i) ? (
          <mark key={i} className="bg-transparent font-bold text-ink underline decoration-[1.5px] underline-offset-2">
            {ch}
          </mark>
        ) : (
          <span key={i}>{ch}</span>
        ),
      )}
    </>
  );
}

export function QuickOpen() {
  const p = useProject();
  const quick = useSearch((s) => s.quick);
  const close = useSearch((s) => s.closeQuick);
  const opts = useSearch((s) => s.opts);
  const navigateTo = useApp((s) => s.navigateTo);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);

  const root = p?.root ?? "";
  const open = useMemo(() => new Set((p?.tabs ?? []).filter((t) => t && isInside(root, t)).map((t) => t.slice(root === "/" ? 1 : root.length + 1))), [p?.tabs, root]);
  const files = quick && quick.kind === "ready" ? quick.files : [];
  const matcher = useMemo(() => (q.trim() && (opts.caseSensitive || opts.wholeWord || opts.regexp) ? buildMatcher(q.trim(), opts) : null), [q, opts]);

  const items = useMemo(() => {
    type Item = { rel: string; idx: number[]; on: boolean; score: number };
    if (!q.trim())
      return [
        ...[...open].filter((r) => files.includes(r)).map((rel) => ({ rel, idx: [] as number[], on: true, score: 0 })),
        ...files.filter((r) => !open.has(r)).map((rel) => ({ rel, idx: [] as number[], on: false, score: 0 })),
      ].slice(0, 50) as Item[];
    if (matcher && !matcher.ok) return [];
    return files
      .flatMap((rel) => {
        const m = matcher ? exact(matcher.re, rel) : fuzzy(q, rel);
        return m ? [{ rel, idx: m.idx, on: open.has(rel), score: m.score }] : [];
      })
      .sort((a, b) => b.score - a.score || (a.rel < b.rel ? -1 : 1))
      .slice(0, 50);
  }, [q, files, open, matcher]);

  const at = Math.max(0, Math.min(sel, items.length - 1));
  const hasOpen = !q.trim() && items.some((x) => x.on);
  const openCount = !q.trim() && hasOpen ? items.filter((x) => x.on).length : 0;

  const opened = useRef(false);
  useEffect(() => {
    if (quick && !opened.current) {
      setQ("");
      setSel(0);
      input.current?.focus();
    }
    opened.current = !!quick;
  }, [quick]);

  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [at, q]);

  if (!quick || !p) return null;

  const step = (d: number) => {
    const n = items.length;
    if (n) setSel((s) => (s + d + n) % n);
  };
  const choose = (i: number) => {
    const it = items[i];
    if (!it) return;
    close();
    void navigateTo(root === "/" ? `/${it.rel}` : `${root}/${it.rel}`);
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center bg-black/20 pt-[12vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div role="dialog" aria-modal="true" aria-label="ファイルを開く" className="w-[min(580px,92vw)] overflow-hidden rounded-[10px] border border-line bg-bg shadow-[0_10px_36px_rgba(0,0,0,.22)]">
        <div className="flex items-center gap-0.5 border-b border-line pr-2">
          <input
            ref={input}
            value={q}
            placeholder="ファイル名で検索"
            spellCheck={false}
            autoComplete="off"
            aria-label="ファイル名で検索"
            className="block h-[38px] min-w-0 flex-1 border-0 bg-transparent px-3.5 text-sm outline-none"
            onChange={(e) => (setQ(e.target.value), setSel(0))}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === "Escape" || ((e.ctrlKey || e.metaKey) && e.code === "KeyP")) {
                e.preventDefault();
                close();
              } else if (e.key === "ArrowDown" || (e.ctrlKey && e.code === "KeyN")) {
                e.preventDefault();
                step(1);
              } else if (e.key === "ArrowUp" || (e.ctrlKey && e.code === "KeyK")) {
                e.preventDefault();
                step(-1);
              } else if (e.key === "Enter") {
                e.preventDefault();
                choose(at);
              } else return;
              e.stopPropagation();
            }}
          />
          <StepButtons onPrev={() => step(-1)} onNext={() => step(1)} keys={["↑", "↓"]} />
          <OptionToggles />
        </div>
        <div ref={list} role="listbox" aria-label="ファイル" className="max-h-[min(50vh,360px)] overflow-y-auto p-1">
          {quick.kind === "loading" && <div className="px-2.5 py-3.5 text-center text-[13px] text-mute">読み込んでいます…</div>}
          {quick.kind === "error" && <div className="px-2.5 py-3.5 text-center text-[13px] text-del-ink">{quick.message}</div>}
          {quick.kind === "ready" && matcher?.ok === false && <div className="px-2.5 py-3.5 text-center text-[13px] text-del-ink">正規表現が正しくありません</div>}
          {quick.kind === "ready" &&
            matcher?.ok !== false &&
            (items.length ? (
              items.map((it, i) => {
                const bs = it.rel.lastIndexOf("/") + 1;
                const name = it.rel.slice(bs);
                const dir = it.rel.slice(0, Math.max(0, bs - 1));
                return (
                  <div key={it.rel}>
                    {!q.trim() && i === 0 && hasOpen && <div className="px-2.5 pt-1 pb-0.5 text-[11px] font-semibold text-mute">開いているファイル</div>}
                    {!q.trim() && hasOpen && !it.on && i === openCount && <div className="px-2.5 pt-1 pb-0.5 text-[11px] font-semibold text-mute">ほかのファイル</div>}
                    <button
                      type="button"
                      tabIndex={-1}
                      role="option"
                      aria-selected={i === at}
                      title={it.rel}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => choose(i)}
                      onMouseEnter={() => setSel(i)}
                      className={clsx("flex min-h-7 w-full items-center gap-2 rounded-md px-2.5 py-[3px] text-left", i === at ? "bg-soft/60" : "hover:bg-code")}
                    >
                      <span className={clsx(badgeCls(extBadge(name)), "w-[22px]")}>{extBadge(name)}</span>
                      <span className="max-w-[60%] flex-none truncate">
                        <Marked text={name} off={bs} idx={it.idx} />
                      </span>
                      <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-mute">
                        <Marked text={dir} off={0} idx={it.idx} />
                      </span>
                      {it.on && q.trim() && <span className="flex-none text-[11px] text-mute">開いている</span>}
                    </button>
                  </div>
                );
              })
            ) : (
              <div className="px-2.5 py-3.5 text-center text-[13px] text-mute">一致するファイルがありません</div>
            ))}
        </div>
        <div className="flex gap-3 overflow-hidden border-t border-line px-3 py-[5px] text-[11px] whitespace-nowrap text-mute">
          <span>
            <kbd className="rounded border border-line bg-code px-1 font-mono text-[10px] text-ink">↑↓</kbd> 選択
          </span>
          <span>
            <kbd className="rounded border border-line bg-code px-1 font-mono text-[10px] text-ink">Enter</kbd> 開く
          </span>
          <span>
            <kbd className="rounded border border-line bg-code px-1 font-mono text-[10px] text-ink">Esc</kbd> 閉じる
          </span>
        </div>
      </div>
    </div>
  );
}
