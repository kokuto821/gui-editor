import { useCallback, useRef } from "react";

/** 境界のドラッグで幅を変える。最小は 0。ダブルクリックで初期幅に戻す。 */
export function useSplitDrag(width: number, onChange: (w: number) => void, initial: number, max = () => window.innerWidth - 80) {
  const start = useRef<{ x: number; w: number } | null>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      start.current = { x: e.clientX, w: width };
    },
    [width],
  );
  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const s = start.current;
      if (s) onChange(Math.round(Math.max(0, Math.min(max(), s.w + e.clientX - s.x))));
    },
    [onChange, max],
  );
  const onPointerUp = useCallback(() => {
    start.current = null;
  }, []);
  const onDoubleClick = useCallback(() => onChange(initial), [onChange, initial]);
  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onDoubleClick };
}
