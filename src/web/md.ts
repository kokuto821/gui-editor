import MarkdownIt from "markdown-it";
import { dirOf, resolvePath } from "./paths";

export interface MdEnv {
  dir: string;
  fileUrl: (absPath: string) => string;
}

const md = new MarkdownIt({ html: false, linkify: false, breaks: false });

// 画像: 相対パスだけを、サーバー経由で表示する。外部の URL は読みに行かない
md.renderer.rules.image = (tokens, idx, _o, rawEnv) => {
  const env = rawEnv as unknown as MdEnv;
  const t = tokens[idx]!;
  const src = String(t.attrGet("src") ?? "");
  const alt = md.utils.escapeHtml(t.content);
  const abs = /^([a-z][a-z0-9+.-]*:|\/\/|\/)/i.test(src) ? null : resolvePath(env.dir, decodeURI(src));
  return abs
    ? `<img src="${md.utils.escapeHtml(env.fileUrl(abs))}" alt="${alt}">`
    : `<span class="mut">（画像を表示できません: ${alt || md.utils.escapeHtml(src)}）</span>`;
};

// チェックボックス（- [ ] / - [x]）: 表示だけ。更新は後で入れる
md.core.ruler.after("inline", "task-list", (state) => {
  const toks = state.tokens;
  for (let i = 2; i < toks.length; i++) {
    const t = toks[i]!;
    if (t.type !== "inline" || toks[i - 1]?.type !== "paragraph_open" || toks[i - 2]?.type !== "list_item_open") continue;
    const first = t.children?.[0];
    const m = first?.type === "text" ? /^\[( |x)\]\s+/i.exec(first.content) : null;
    if (!first || !m) continue;
    first.content = first.content.slice(m[0].length);
    const box = new state.Token("html_inline", "", 0);
    box.content = `<input type="checkbox" disabled${m[1]!.toLowerCase() === "x" ? " checked" : ""}>`;
    t.children!.unshift(box);
    toks[i - 2]!.attrJoin("class", "task");
  }
});

export function renderMd(src: string, filePath: string, fileUrl: MdEnv["fileUrl"]): string {
  return md.render(src, { dir: dirOf(filePath), fileUrl } satisfies MdEnv);
}
