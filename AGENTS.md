# rule
- DESIGN.md=リポジトリ設計方針
- prototype.html=プロトタイプ用ファイル

# ハーネス
- issue作成=matagi(`matagi:github-issue-create`)のみ使う
- 実装・テスト・レビュー・調査・ブランチ/コミット/PR作成を含むそれ以外=pstackを使う(`/pstack:poteto-mode` など)
- matagiのその他のskill/agentは `.claude/settings.json` の `permissions.deny` で拒否している。使おうとしない
- matagiのフック(保護ブランチ上のcommit/push/編集の拒否、`gh pr merge`の拒否)は残す。PRのマージはユーザーが行う
- UIを変更する改修は、テスト工程を抜かして、最短経路で実装し、ファイルの中身をユーザーにチェックしてもらう。ユーザーから承認を受けたあとはリファクタリング、テスト実装を行う。
