// Mermaid は重いので、図があるときだけ読み込む。配色は CSS 変数から取り、ダークモードに合わせて描き直す。

type Mermaid = typeof import("mermaid").default;
let lib: Promise<Mermaid> | null = null;
let seq = 0;
const cache = new Map<string, string>();

const load = () => (lib ??= import("mermaid").then((m) => m.default));

function theme() {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string) => cs.getPropertyValue(n).trim();
  return { bg: v("--color-bg"), line: v("--color-line"), ink: v("--color-ink"), mute: v("--color-mute"), soft: v("--color-soft"), code: v("--color-code") };
}

const escHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** root の中の `.mmd[data-src]`（まだ描いていないもの）を、図にする。 */
export async function renderMermaidIn(root: HTMLElement): Promise<void> {
  const boxes = [...root.querySelectorAll<HTMLElement>(".mmd[data-src]")];
  if (!boxes.length) return;
  const t = theme();
  const key = JSON.stringify(t);
  const todo: HTMLElement[] = [];
  for (const box of boxes) {
    const hit = cache.get(key + "\n" + box.dataset.src);
    if (hit) {
      box.innerHTML = hit;
      box.removeAttribute("data-src");
    } else todo.push(box);
  }
  if (!todo.length) return;
  let mermaid: Mermaid;
  try {
    mermaid = await load();
  } catch {
    for (const box of todo) box.innerHTML = `<p class="mmd-err">Mermaid を読み込めませんでした</p><pre>${escHtml(box.dataset.src ?? "")}</pre>`;
    return;
  }
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: "base",
    fontFamily: "IBM Plex Sans JP, sans-serif",
    themeVariables: {
      background: t.bg, primaryColor: t.bg, primaryBorderColor: t.mute, primaryTextColor: t.ink,
      secondaryColor: t.soft, tertiaryColor: t.code, lineColor: t.mute, textColor: t.ink,
      noteBkgColor: t.soft, noteTextColor: t.ink, noteBorderColor: t.line,
      actorBkg: t.bg, actorBorder: t.mute, actorTextColor: t.ink, signalColor: t.mute, signalTextColor: t.ink, edgeLabelBackground: t.bg,
    },
  });
  for (const box of todo) {
    const src = box.dataset.src ?? "";
    if (!box.isConnected) continue;
    box.removeAttribute("data-src");
    try {
      const { svg } = await mermaid.render(`mmd-${++seq}`, src);
      cache.set(key + "\n" + src, svg);
      if (box.isConnected) box.innerHTML = svg;
    } catch (e) {
      // 書き損じ: エラーの1行目とソースを、そのまま出す
      const msg = String((e as Error)?.message ?? e).split("\n")[0] ?? "";
      if (box.isConnected) box.innerHTML = `<p class="mmd-err">図を描けませんでした: ${escHtml(msg)}</p><pre>${escHtml(src)}</pre>`;
      document.getElementById(`dmmd-${seq}`)?.remove(); // mermaid が残すエラー用の要素
    }
  }
}
