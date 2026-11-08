# コードの健康管理（大きさ・長さの管理）

長いファイル・長い関数ほど、人にも AI にも、編集の誤り（位置違い・前後の文脈の見落とし・別の箇所との取り違え）が増える。
「今より悪くしない」だけでは、すでに大きいものが、そのまま残る。**目標値を決め、超えているものを負債として一覧にし、計画を立てて、減らし続ける**。

## 目標値（`scripts/code_health.mjs` の `TARGET`）
- ファイル: **800 行・60KB 以下**
- 関数・メソッド: **100 行以下**
- 新しく書くコード・新しいファイルは、**必ず目標を守る**（テスト `test/code_health.test.mjs` が止める）。

## 負債台帳（`scripts/codeHealth.debt.json`）
- 目標を超えている既存のファイル・関数の一覧。それぞれに、**計画（plan）**（何を・どの順で分けるか）を書く。
- 台帳の値は**増やせない**。分割して小さくなったら、`bun scripts/code_health.mjs --tighten` で値を下げる。
- 目標を満たしたら、台帳から**外す**（同じコマンドが外す。外し忘れも、テストが失敗にする）。
- 台帳に、理由と計画なしに足さない（足すのは、本当に分けられない場合だけ。理由を plan に書く）。

## 進め方
1. **触ったら小さくする**: 台帳に載るファイル・関数を修正するときは、その作業の範囲で、目標に近づける（切り出せる塊があれば、切り出す）。
2. **定期の見直し**: 大きな機能を足したあと・節目ごとに、`bun scripts/code_health.mjs` を実行して、負債の合計と優先順位を確認する。報告して、次に分割するものを決める。
3. **分割の手順**（1 回に 1 つ。毎回コミット）:
   - 移すのは、まとまった塊（描画の種類・機能・段階）。**中身は変えず、移すだけ**にする（挙動の変更と分けて、確認しやすくする）。
   - `bun test`（テストは、`test/helpers/game.mjs` の `gameSource()`・`copyGameModules()` で、分割に強い読み方をする）。**`test/scope_check.test.mjs`（`scripts/scope_check.mjs`）が、分割で、使っている変数の宣言を取りこぼしていないか（移した先で未定義）を、描画を実行せずに見つける**（描画のコードは、テストでは実行されないため）。
   - 描画に関わる分割は、**ブラウザの確認**: maachang を起動して `PROF=$(mktemp -d) bun scripts/verify_maps.mjs`（全種類のタイルを含むマップを順に読み込み、例外・エラーがないことを確かめる）。
   - 台帳を `--tighten` して、コミット。
4. 外から見える名前（`export`）は、分割しても、これまでの場所から読めるようにする（`game.js` から再公開）。

## 分割で気をつけること（今回の経験から）
- コメント（`//`・`/** */`）は、メソッドと一緒に移す（取り残さない）。
- 関数の中の `return`・`break`・`continue`、外側の変数への代入は、関数に分けると意味が変わる。道具（`.claudeWork` の分割スクリプト）は、これらを検出して止まる。
- テストが「通る」ことと、描画が「同じ」ことは、別。描画に関わる分割は、`scripts/verify_maps.mjs`（エラーなし）と、メッシュ数・頂点数・材質数の分割前後の比較（`.claudeWork/scene_stats.mjs` の方法）で確かめる。
- コミットは、テストの成功を確認してから（`&&` でつなぐと、失敗を素通りする）。

## 現状（2026-11-08）
負債台帳は、**空**（目標を超えるファイル・関数は、0）。分割の結果:
- `game.js` 5735 → 325 行。タイルの描画（`game/tiles*.js`）・毎フレームの更新（`updateWorld`・`updatePlayer`）・マップの地形と見た目（`mapTerrain`・`mapVisuals`・`mapNeighbors`）・マップの読み込み（`mapLoad`）・描画の補助・移動・装備・戦闘・HUD・操作・入力・テクスチャの登録・初期状態は、`public/js/game/` の部品。
- `textures.js` 2603 → 28 行（`public/js/textures/` の 6 部品）。`entities.js` 1580 → 249 行（`Monster` の部品は `public/js/monster/`、飛び道具 `Projectile` は `public/js/projectile.js`）。`audio.js` 963 → 21 行（`public/js/audio/`）。
- Python: `terrain.py` 1099 → 約 360 行（`terrain_base`・`terrain_coast`・`terrain_mountain`・`terrain_sites`）。`gen_world.py` 722 → 228 行（定数は `world_consts.py`、マスごとの物体と地面の生成 `build_tiles` と各段階は `world_tiles.py`）。`terrain.py` の `build`・`town_d.py` の `build`・`_mountains` は、段階ごとの関数。
- 確認の仕組み: 負債の台帳テスト・未定義の変数の検査（`scripts/scope_check.mjs`）・ブラウザでの確認（`scripts/verify_maps.mjs`）。
- **これからは、この状態を保つ**: 新しいコードは目標を守り、大きくなる前に分ける。節目ごとに `bun scripts/code_health.mjs` で確認する。報告の「注意」（目標の 80% 以上＝ファイル 640 行・関数 80 行以上）に出たものは、超える前に、早めに分ける。
