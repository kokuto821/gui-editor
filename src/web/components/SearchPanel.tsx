import clsx from "clsx";
import { useEffect, useMemo, useRef } from "react";
import type { TextHit } from "../../shared/protocol";
import { baseOf, dirOf, joinPath } from "../paths";
import { useApp, useProject } from "../stores/app";
import { IDLE, useSearch, visibleHits } from "../stores/search";
import { Chevron, ExtBadge } from "./Badge";
import { IconSearch, IconX } from "./Icons";
import { HIT_MARK, OptionToggles, StepButtons } from "./SearchBar";

/** 入力欄へのフォーカスの要求のうち、受け付けたもの（一覧を開き直しても、同じ要求で2回フォーカスしない） */
let focused = 0;

function Hl({ text, from, to }: { text: string; from: number; to: number }) {
  return (
    <>
      {text.slice(0, from)}
      <mark className={HIT_MARK}>{text.slice(from, to)}</mark>
      {text.slice(to)}
    </>
  );
}

/** 結果を、ファイルごとにまとめる（サーバーは path の順に並べて返す）。start は、その先頭の結果の添字 */
function groupHits(hits: TextHit[]) {
  const out: { path: string; start: number; hits: TextHit[] }[] = [];
  hits.forEach((h, i) => {
    const g = out[out.length - 1];
    if (g?.path === h.path) g.hits.push(h);
    else out.push({ path: h.path, start: i, hits: [h] });
  });
  return out;
}

const Note = ({ children, error }: { children: React.ReactNode; error?: boolean }) => (
  <p className={clsx("m-0 px-2 py-1 text-xs leading-relaxed", error ? "text-del-ink" : "text-mute")}>{children}</p>
);

/** 一覧の「検索」: ファイルの中身を探す（Ctrl+Shift+F） */
export function SearchPanel() {
  const p = useProject();
  const st = useSearch((s) => (p ? s.text[p.root] : undefined)) ?? IDLE;
  const focus = useSearch((s) => s.focusText);
  const setQuery = useSearch((s) => s.setQuery);
  const focusInput = useSearch((s) => s.focusInput);
  const toggleCollapsed = useSearch((s) => s.toggleCollapsed);
  const pane = useApp((s) => s.pane);
  const setPane = useApp((s) => s.setPane);
  const openHit = useApp((s) => s.openHit);
  const openInNewTab = useApp((s) => s.openInNewTab);
  const move = useApp((s) => s.move);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const r = st.result;
  const sel = r.kind === "done" ? r.sel : null;
  const hits = r.kind === "done" ? r.hits : null;
  const groups = useMemo(() => (hits ? groupHits(hits) : []), [hits]);

  useEffect(() => {
    if (focus === focused) return;
    focused = focus;
    input.current?.focus();
    input.current?.select();
  }, [focus]);
  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  if (!p) return null;
  const root = p.root;

  let body: React.ReactNode;
  if (r.kind === "idle") body = null;
  else if (r.kind === "pending") body = <Note>検索しています…</Note>;
  else if (r.kind === "error") body = <Note error>{r.message}</Note>;
  else if (!r.hits.length) body = <Note>「{r.q}」に一致する結果はありません</Note>;
  else
    body = (
      <>
        <div className="flex items-center gap-1 pr-0.5 pb-0.5 pl-2 text-xs text-mute">
          <span className="min-w-0 flex-1 truncate">
            {r.hits.length}
            {r.truncated ? "+" : ""} 件の結果（{groups.length} ファイル）
          </span>
          <StepButtons onPrev={() => void move(-1)} onNext={() => void move(1)} keys={["↑", "↓"]} />
        </div>
        {groups.map((g) => {
          const col = !!st.collapsed[g.path];
          const dir = g.path.includes("/") ? dirOf(g.path) : "";
          return (
            <div key={g.path}>
              <button type="button" tabIndex={-1} title={g.path} aria-expanded={!col} onClick={() => toggleCollapsed(root, g.path)} className="mt-0.5 flex min-h-[26px] w-full items-center gap-1.5 rounded-md px-1.5 py-0.5 text-left hover:bg-code">
                <Chevron open={!col} className="w-4 text-center" />
                <ExtBadge name={g.path} />
                <span className="max-w-[60%] flex-none truncate">{baseOf(g.path)}</span>
                <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-mute">{dir}</span>
                <span className="ml-auto min-w-4 flex-none rounded-lg bg-soft px-1 text-center font-mono text-[10px] leading-[15px] font-medium text-ink">{g.hits.length}</span>
              </button>
              {!col &&
                g.hits.map((h, k) => {
                  const i = g.start + k;
                  const on = sel?.i === i;
                  return (
                    <button
                      key={i}
                      type="button"
                      tabIndex={-1}
                      role="option"
                      aria-selected={on}
                      title={`${g.path}:${h.line}`}
                      onClick={() => void openHit(i)}
                      onDoubleClick={() => void openInNewTab(joinPath(root, h.path))}
                      className={clsx(
                        "flex min-h-6 w-full items-baseline gap-2 rounded-md py-px pr-2 pl-[30px] text-left font-mono text-xs leading-[1.7]",
                        on ? (pane === "preview" ? "bg-soft/60 text-ink" : "bg-soft text-ink") : "text-mute hover:bg-code",
                      )}
                    >
                      <span className="min-w-[2.2em] flex-none text-right opacity-70">{h.line}</span>
                      <span className="min-w-0 flex-1 truncate whitespace-pre">
                        <Hl text={h.text} from={h.from} to={h.to} />
                      </span>
                    </button>
                  );
                })}
            </div>
          );
        })}
      </>
    );

  return (
    <div className="flex min-h-0 flex-1 flex-col p-1.5" onMouseDown={() => setPane("list")}>
      <div role="search" className="mx-0.5 mb-1.5 flex flex-none items-center gap-1.5 rounded-md border border-line bg-bg pr-px pl-2 focus-within:border-ink">
        <span className="flex-none text-mute [&_svg]:size-[13px]"><IconSearch /></span>
        <input
          ref={input}
          value={st.q}
          placeholder="検索"
          aria-label="ファイルの中身を検索"
          spellCheck={false}
          autoComplete="off"
          className="h-[26px] min-w-0 flex-1 bg-transparent text-[13px] outline-none"
          onChange={(e) => setQuery(root, e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === "ArrowDown" || (e.key === "Enter" && !e.shiftKey)) {
              // 最初の結果を開いて、一覧へ（入力した直後で、まだ前の言葉の結果しかなければ、一覧へ移るだけ）
              e.preventDefault();
              const first = visibleHits(st)[0];
              if (first !== undefined && r.kind === "done" && r.q === st.q) void openHit(first);
              e.currentTarget.blur();
            } else if (e.key === "Escape") e.currentTarget.blur();
          }}
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label="検索をクリア"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => (setQuery(root, ""), focusInput())}
          className={clsx("grid size-5 flex-none place-items-center rounded text-mute hover:bg-soft hover:text-ink [&_svg]:size-[11px]", !st.q && "invisible")}
        >
          <IconX />
        </button>
        <OptionToggles />
      </div>
      <div ref={list} role="listbox" aria-label="検索結果" className="min-h-0 flex-1 overflow-y-auto">
        {body}
      </div>
    </div>
  );
}
