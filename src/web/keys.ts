import { useApp } from "./stores/app";

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);

/** キー操作は、React の外で1回だけ登録する。 */
export function installKeys(): void {
  window.addEventListener("keydown", (e) => {
    if (e.isComposing || isTyping(e.target)) return;
    const s = useApp.getState();

    if (e.altKey && !e.ctrlKey && !e.metaKey) {
      const m = /^Digit([1-9])$/.exec(e.code);
      if (m) {
        e.preventDefault();
        const i = Number(m[1]) - 1;
        if (i < s.projects.length) void s.switchProject(i);
      } else if (e.code === "KeyW") {
        e.preventDefault();
        void s.closeProject(s.active);
      }
      return;
    }
    if (e.ctrlKey || e.metaKey) return;

    const scroller = document.getElementById("preview-scroll");
    // プレビューをクリックした後は、上下キーでプレビューをスクロールする
    if (s.pane === "preview" && scroller) {
      const page = scroller.clientHeight * 0.5;
      const by: Record<string, number> = { ArrowDown: 60, j: 60, ArrowUp: -60, k: -60, d: page, u: -page };
      if (e.key in by) return e.preventDefault(), scroller.scrollBy({ top: by[e.key] });
      if (e.key === "g" || e.key === "Home") return e.preventDefault(), scroller.scrollTo({ top: 0 });
      if (e.key === "G" || e.key === "End") return e.preventDefault(), scroller.scrollTo({ top: scroller.scrollHeight });
      if (e.key === "Escape") return s.setPane("list");
      return;
    }

    switch (e.key) {
      case "ArrowDown":
      case "j":
        e.preventDefault();
        return void s.move(1);
      case "ArrowUp":
      case "k":
        e.preventDefault();
        return void s.move(-1);
      case "ArrowRight":
      case "l":
        e.preventDefault();
        return void s.enter();
      case "ArrowLeft":
      case "h":
        e.preventDefault();
        return void s.up();
      case "g":
      case "Home":
        e.preventDefault();
        return void s.jump(false);
      case "G":
      case "End":
        e.preventDefault();
        return void s.jump(true);
      case "d":
      case "u":
        scroller?.scrollBy({ top: (e.key === "d" ? 1 : -1) * scroller.clientHeight * 0.5 });
    }
  });
}
