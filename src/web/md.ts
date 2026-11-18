import MarkdownIt from "markdown-it";
import { dirOf, resolvePath } from "./paths";

export interface MdEnv {
  /** 表示している MD のフォルダ（画像の相対パスの基準） */
  dir: string;
  /** プロジェクトのフォルダ（[[リンク]] の基準） */
  root: string;
  fileUrl: (absPath: string) => string;
}

const md = new MarkdownIt({ html: false, linkify: false, breaks: false });
const esc = md.utils.escapeHtml;

// 画像: 相対パスだけを、サーバー経由で表示する。外部の URL は読みに行かない
md.renderer.rules.image = (tokens, idx, _o, rawEnv) => {
  const env = rawEnv as unknown as MdEnv;
  const t = tokens[idx]!;
  const src = String(t.attrGet("src") ?? "");
  const alt = esc(t.content);
  const abs = /^([a-z][a-z0-9+.-]*:|\/\/|\/)/i.test(src) ? null : resolvePath(env.dir, safeDecode(src));
  return abs
    ? `<img src="${esc(env.fileUrl(abs))}" alt="${alt}">`
    : `<span class="mut">（画像を表示できません: ${alt || esc(src)}）</span>`;
};

function safeDecode(s: string): string {
  try {
    return decodeURI(s);
  } catch {
    return s;
  }
}

// Mermaid: ```mermaid は図として表示する（描画は画面側で、読み込みが済んでから行う）
const fence = md.renderer.rules.fence!;
md.renderer.rules.fence = (tokens, idx, o, env, self) => {
  const t = tokens[idx]!;
  if (t.info.trim().split(/\s+/)[0] === "mermaid") return `<div class="mmd" data-src="${esc(t.content)}">図を描いています…</div>\n`;
  return fence(tokens, idx, o, env, self);
};

// [[docs/a.md]]: プロジェクトのフォルダからの相対パスで、そのファイルへ移るリンク
md.inline.ruler.before("link", "wikilink", (state, silent) => {
  const src = state.src;
  if (src.charCodeAt(state.pos) !== 0x5b || src.charCodeAt(state.pos + 1) !== 0x5b) return false;
  const end = src.indexOf("]]", state.pos + 2);
  if (end < 0) return false;
  const text = src.slice(state.pos + 2, end).trim();
  if (!text || text.includes("\n")) return false;
  if (!silent) {
    const t = state.push("wikilink", "", 0);
    t.content = text;
  }
  state.pos = end + 2;
  return true;
});
md.renderer.rules.wikilink = (tokens, idx, _o, rawEnv) => {
  const env = rawEnv as unknown as MdEnv;
  const text = tokens[idx]!.content;
  const abs = resolvePath(env.root, safeDecode(text));
  return abs ? `<a href="#" data-goto="${esc(abs)}">${esc(text)}</a>` : esc(text);
};

// チェックボックス（- [ ] / - [x]）: 押すと、その行を書き換える（data-line がソースの行番号）
md.core.ruler.after("inline", "task-list", (state) => {
  const toks = state.tokens;
  for (let i = 2; i < toks.length; i++) {
    const t = toks[i]!;
    const para = toks[i - 1];
    if (t.type !== "inline" || para?.type !== "paragraph_open" || toks[i - 2]?.type !== "list_item_open") continue;
    const first = t.children?.[0];
    const m = first?.type === "text" ? /^\[( |x)\]\s+/i.exec(first.content) : null;
    if (!first || !m || !para.map) continue;
    first.content = first.content.slice(m[0].length);
    const box = new state.Token("html_inline", "", 0);
    const on = m[1]!.toLowerCase() === "x";
    box.content = `<input type="checkbox" data-line="${para.map[0]}"${on ? " checked" : ""} aria-label="${esc(first.content.slice(0, 60))}">`;
    t.children!.unshift(box);
    toks[i - 2]!.attrJoin("class", on ? "task done" : "task");
  }
});

export function renderMd(src: string, filePath: string, root: string, fileUrl: MdEnv["fileUrl"]): string {
  return md.render(src, { dir: dirOf(filePath), root, fileUrl } satisfies MdEnv);
}
