// プレビュー（MD の整形表示）の中の一致に <mark> を付ける。markdown-it の HTML を直接いじる

import { matchesIn } from "../../shared/match";

export function unmark(root: HTMLElement, cls: string): void {
  root.querySelectorAll(`mark.${cls}`).forEach((m) => m.replaceWith(document.createTextNode(m.textContent ?? "")));
  root.normalize();
}

/** re に一致するところを <mark class={cls}> で包み、上から順に返す。re が null なら印を消すだけ。図（Mermaid）の中は見ない */
export function markIn(root: HTMLElement, re: RegExp | null, cls: string): HTMLElement[] {
  unmark(root, cls);
  if (!re) return [];
  const nodes: Text[] = [];
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement?.closest(`mark.${cls}, .mmd, svg, script, style`) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  for (let n = w.nextNode(); n; n = w.nextNode()) nodes.push(n as Text);
  const out: HTMLElement[] = [];
  for (const node of nodes) {
    const t = node.nodeValue ?? "";
    const frag = document.createDocumentFragment();
    let last = 0;
    for (const { from, to } of matchesIn(re, t)) {
      if (from > last) frag.append(t.slice(last, from));
      const m = document.createElement("mark");
      m.className = cls;
      m.textContent = t.slice(from, to);
      frag.append(m);
      out.push(m);
      last = to;
    }
    if (!last) continue;
    if (last < t.length) frag.append(t.slice(last));
    node.replaceWith(frag);
  }
  return out;
}

/** el を、スクロールする親（プレビュー）の縦の真ん中へ寄せる */
export function centerIn(el: HTMLElement): void {
  const box = el.closest<HTMLElement>("#preview-scroll");
  if (box) box.scrollTop += el.getBoundingClientRect().top - box.getBoundingClientRect().top - box.clientHeight / 2;
}
