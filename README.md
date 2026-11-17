# cgui

ローカルで動く、ファイルを「見る・書き換える」ためのGUI。Claude Code と git の操作は CLI に任せ、GUI と CLI はプロジェクトのファイルだけでつながる。設計は [DESIGN.md](./DESIGN.md)、画面の検討用プロトタイプは [prototype.html](./prototype.html)。

CLI がローカルサーバーを立て、ブラウザで画面を開く。WSL なら、Windows 側の Chrome / Edge を専用ウィンドウ（`--app`）で開く。

## 今できること（最小構成）

- `cgui .` でフォルダをプロジェクトとして開く。すでに動いていれば、そのサーバーにタブを足す
- ファイル一覧（フォルダの移動、選択位置の記憶）と、プレビュー（MD、コード、画像）
- 表示に対応していないファイル（テキストではないもの）は、プレビューで知らせる
- CLI がファイルを書き換えたら、監視して画面に反映する

まだないもの: 編集と保存、ブックマーク、プレビューのタブ、Git の差分、Mermaid（DESIGN.md を参照）。

## 導入

前提は、Node 20 以上（WSL の中に入れる）と、`git`。

```bash
# GitHub から（公開後）
npm i -g github:kokuto821/gui-editor
# 非公開のうち（SSH 鍵が要る）
npm i -g git+ssh://git@github.com/kokuto821/gui-editor.git
```

## 使い方

```bash
cgui .            # 今のフォルダを開く
cgui ~/work/blog  # フォルダを指定して開く
cgui stop         # サーバーを止める
cgui --no-open .  # ブラウザを開かず、URL だけ表示する
```

| キー | 操作 |
| --- | --- |
| `↑` `↓` / `j` `k` | 移動 |
| `←` `→` / `h` `l` | 親のフォルダへ / フォルダの中へ |
| `g` `G` | 先頭 / 末尾 |
| `d` `u` | プレビューをスクロール |
| `Alt+1`〜`9` / `Alt+W` | プロジェクトの切替 / 閉じる |

- サーバーは `127.0.0.1` だけで待ち受け、URL のトークンと `Host` / `Origin` を確かめる。ポートとトークンは `~/.cache/cgui/lock.json`、ログは `~/.cache/cgui/server.log` にある。
- ブラウザを選びたいときは、環境変数 `CGUI_BROWSER` に実行ファイルを指定する。

## 開発

```bash
npm install
npm run build      # 画面（dist/web）とサーバー（dist/cli.js）を作る
npm link           # cgui コマンドを、このフォルダへのリンクにする
npm test           # vitest
npm run typecheck
npm run dev:web    # 画面だけを Vite で動かす（サーバーは別に要る）
```

構成は DESIGN.md の6章「内部構成」を参照。
