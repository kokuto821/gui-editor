// プレビュー（MD の整形表示）の中の一致に <mark> を付ける。markdown-it の HTML を直接いじる

export function unmark(root: HTMLElement, cls: string): void {
  root.querySelectorAll(`mark.${cls}`).forEach((m) => m.replaceWith(document.createTextNode(m.textContent ?? "")));
  root.normalize();
}

/** q に一致するところ（大文字小文字は区別しない）を <mark class={cls}> で包み、上から順に返す。図（Mermaid）の中は見ない */
export function markIn(root: HTMLElement, q: string, cls: string): HTMLElement[] {
  unmark(root, cls);
  if (!q) return [];
  const ql = q.toLowerCase();
  const nodes: Text[] = [];
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement?.closest(`mark.${cls}, .mmd, svg, script, style`) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  for (let n = w.nextNode(); n; n = w.nextNode()) nodes.push(n as Text);
  const out: HTMLElement[] = [];
  for (const node of nodes) {
    const t = node.nodeValue ?? "";
    const lo = t.toLowerCase();
    let i = lo.indexOf(ql);
    if (i < 0) continue;
    const frag = document.createDocumentFragment();
    let last = 0;
    while (i >= 0) {
      if (i > last) frag.append(t.slice(last, i));
      const m = document.createElement("mark");
      m.className = cls;
      m.textContent = t.slice(i, i + q.length);
      frag.append(m);
      out.push(m);
      last = i + q.length;
      i = lo.indexOf(ql, last);
    }
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
