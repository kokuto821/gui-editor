import clsx from "clsx";
import { useEffect, useRef } from "react";
import { useUi } from "../stores/ui";

/** 確認のダイアログ（保存 / 破棄 / キャンセル など）。Esc でキャンセル、←→ でボタンを移る。 */
export function DialogHost() {
  const dialog = useUi((s) => s.dialog);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dialog) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("[data-primary]")?.focus();
    return () => prev?.focus?.();
  }, [dialog]);

  if (!dialog) return null;
  const onKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "Escape") return (e.preventDefault(), dialog.resolve("cancel"));
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      const bs = [...(ref.current?.querySelectorAll("button") ?? [])];
      const i = bs.indexOf(document.activeElement as HTMLButtonElement);
      e.preventDefault();
      bs[(i + (e.key === "ArrowRight" ? 1 : bs.length - 1)) % bs.length]?.focus();
    }
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/35" onMouseDown={(e) => e.target === e.currentTarget && dialog.resolve("cancel")}>
      <div ref={ref} role="dialog" aria-modal="true" onKeyDown={onKeyDown} className="min-w-72 max-w-md rounded-xl border border-line bg-bg p-5 shadow-[0_8px_30px_rgba(0,0,0,.18)]">
        <p className="m-0 mb-4 whitespace-pre-line">{dialog.message}</p>
        <div className="flex justify-end gap-2">
          {dialog.buttons.map((b) => (
            <button
              key={b.id}
              type="button"
              data-primary={b.primary ? "" : undefined}
              onClick={() => dialog.resolve(b.id)}
              className={clsx("rounded-md border px-3 py-1 hover:bg-soft focus-visible:bg-soft", b.primary ? "border-ink bg-ink text-bg hover:bg-ink/85 focus-visible:bg-ink/85" : "border-line")}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Toast() {
  const toast = useUi((s) => s.toast);
  if (!toast) return null;
  return (
    <div role="status" className="pointer-events-none fixed bottom-10 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-ink px-3.5 py-1.5 text-bg shadow-lg">
      {toast}
    </div>
  );
}
