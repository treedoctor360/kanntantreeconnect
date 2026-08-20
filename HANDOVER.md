# 引き継ぎメモ（2026-08-20 時点）

このリポジトリで何をしたか、いま何が残っているかをまとめたもの。
**仕様そのものは [CLAUDE.md](./CLAUDE.md) が正**。ここには「経緯」と「未解決」だけを書く。

---

## 0. いま何がある状態か

| 項目 | 状態 |
|---|---|
| リポジトリ | `treedoctor360/kanntantreeconnect`（旧 `major-wood-decay-fungi` からリネーム済み） |
| 公開URL | https://treedoctor360.github.io/kanntantreeconnect/ |
| `main` の先頭 | `4ab3888` 幹の損傷と結合部の異常（入り皮）を追加する (#4) |
| テスト | `npm test` — **84件すべて成功** |
| ビルド | `npm run build` — 成功。`main` に push すると Actions が自動デプロイ |
| GAS同期 | **コードは完成。ただし実際のスプレッドシートでの動作は未確認**（下記4章） |

アプリは kantantree（かんたん樹木登録）の構成に、**スプレッドシート連携（GAS）** と
**紙のチェックシートの点検内容** を足したもの。

---

## 1. このブランチでやったこと（PR 4本）

| PR | コミット | 内容 |
|---|---|---|
| #1 | `6592c46` | kantantree の構成を移植 ＋ GAS連携 ＋ 点検内容（1ページ目） |
| #2 | `93e5f7f` | GAS中継が初回に失敗する問題の修正 ＋ 自己診断 |
| #3 | `a65c011` | スプレッドシートに追加された項目（樹高・空洞/傷の位置・周辺環境） |
| #4 | `4ab3888` | さらに追加された項目（幹の損傷・結合部の異常＝入り皮） |

### 1-1. kantantree からの移植（#1）

[treedoctor360/kantantree](https://github.com/treedoctor360/kantantree) と同じ構成。
Vite + React / Dexie(IndexedDB) / React-Leaflet ＋ 国土地理院タイル /
GitHub Actions で Pages へ自動デプロイ。4タブ（登録・一覧・地図・設定）。

本リポジトリ向けに変えたのは公開パスだけ（`base: '/kanntantreeconnect/'` など）。

### 1-2. スプレッドシート連携（#1・#2）

```
アプリ（GitHub Pages）  ──POST（JSON / text/plain）──▶  GAS Web App  ──▶  スプレッドシート
                        ◀──JSON────────
```

- **起動のたび**にシートを取り込む（`syncOnStartup`）
- **書き換えのたび**に 2.5秒まとめて送る（`startAutoSync`。失敗したら 5s→15s→60s→3分で再送）
- 突き合わせは JSON取込と同じ規則（`id` 一致なら `updatedAt` の新しい方。削除は `deletions` シート）
- 取りこぼし対策として、**保存と同じトランザクション**で `pending` テーブルへ id を積む
- 写真・樹種マスタは送らない（Base64がセル上限5万文字を超えるため。枚数 `photoCount` だけ送る）

**#2 で直した実装バグ**: `writeHeaders_` が列ごとに1000行へ `setNumberFormat` を呼んでいて、
初回リクエストだけ極端に遅くタイムアウトし得た。シート全体を一括で書式設定してから
数値列だけ戻す形に変更（trees で 19回 → 7回）。アプリ側のタイムアウトも 20秒 → 45秒。

### 1-3. 点検内容（#1・#3・#4）

紙の「樹木点検 現地チェックシート」1ページ目を**紙と同じ並び**でアプリに写した。
選択肢の定義は `src/lib/inspection.js` に集約（画面・CSV・GASが同じ定義を見る）。

現在のフィールド（`INSPECTION_FIELDS` の順）:

```
tapeNo, height, leafDensity, fungus, fungusPart, cavity, cavityPart,
trunkDamage, barkInclusion, frass, envRoad, envWire, envBuilding, envNote, caution
```

表頭（登録のたびに引き継ぐ）: `surveyDate` / `surveyor` / `tapeRoll`

入力を軽くするためにやったこと:

- **樹高**: よく使う高さ（3/5/8/10/15/20 m）をタップ＋自由入力（現場では巻尺を使わない）
- **周辺環境**: 「すべて無」ボタンで3項目を一度に
- **キノコ部位 / 空洞・傷の位置**: 親項目が「有」のときだけ出す（「無」に戻すと消える）
- どの選択肢も**もう一度押すと外れる**

### 1-4. その他の判断

- **テープ番号は公園をまたいで連続**（紙の運用ルール2）。`nextTapeNo` は端末全体・ロール記号ごとに
  最大値+1を出す。樹木番号は `{公園コード}-{テープ番号}`（`A201` → `P001-A201`）
- **「見つけたらすぐ連絡」**（運用ルール4）を `urgentNotes()` で入力直後に画面へ出す
- リポジトリ名を `kanntantreeconnect` にリネーム（GitHub側の操作はユーザーが実施済み）

---

## 2. 触るときに気をつけること

- **項目を足すときは4か所そろえる**
  `src/lib/inspection.js` → 登録フォームの保存処理 → `src/lib/io.js`（CSV/GeoJSON）→
  `gas/Code.gs` の `SHEETS.trees`（＋ `gas/README.md` の表）。
  `test/inspection.test.js` が「GASの列から漏れていないか」を機械で確かめている。
- **既存シートの列がずれない仕組みがある**。`gas/Code.gs` の `ensureHeaders_` が、
  見出しが `SHEETS` と違えば古い見出しで読んでから新しい列位置へ並べ替える。
- **Apps Script のコードはこの環境からは編集できない。** Drive連携でシートを共有されても、
  ソース編集とデプロイは別の仕組み（Apps Script API）で触れない。
  貼り付けと再デプロイは必ずユーザーにお願いすること。
- **Web AppのURL・合言葉（`SYNC_TOKEN`）はチャット・コミット・スクショに載せない。**
- 差分修正が基本。UIは日本語、コメントも日本語。事実と推定を分け、推定には【推定】を付ける。

---

## 3. 検証のやり方

```bash
npm ci
npm test          # node --test。84件
npm run build
npm run dev -- --port 5199   # → http://localhost:5199/kanntantreeconnect/
```

実機相当の確認には Playwright（Chromium は `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`）を使い、
`page.route('https://script.google.com/**', ...)` で GAS を偽サーバに差し替えて
起動時取り込み・自動保存・削除の伝播・圏外→復帰まで通した。

`gas/Code.gs` は node の `vm` で読み込み、`SpreadsheetApp` / `PropertiesService` /
`LockService` / `ContentService` を模したハーネスで実行して確認した
（新規シートへの `doGet`、push→pull の往復、旧列シートの並べ替え）。
**このハーネスは一時ファイルなので残っていない。** 必要なら作り直すか、
`test/` に入れて `npm test` に載せるのが望ましい（未実施）。

---

## 4. 未解決・次にやること

### 4-1. 【最優先】GAS同期が実環境で未確認

ユーザーの環境で「同期できず GAS中継エラー」が出たまま。
最後に確認したスプレッドシート（`樹木登録GAS連携`）は**「シート1」だけで空**だった＝
`parks`/`trees`/`deletions` が作られていない＝**一度も正常に動いていない**。

コード側の遅さは #2 で直したが、**原因が確定していない**。ユーザーに次をお願いしている:

1. シートを開いて 拡張機能 → Apps Script
2. 中身を全部消して最新の `gas/Code.gs` を貼り付けて保存
3. デプロイを管理 → 編集 → **新しいバージョン** → デプロイ（アクセスは**全員**）
4. 末尾 `/exec` のURLを**ブラウザで開いて**、出た内容を報告してもらう

4番の結果で原因が確定する（`gas/README.md` の「うまくいかないとき（まずこれ）」に対応表あり）。
よくある原因は ①アクセスが「全員」でない ②スタンドアロンで作った（`SPREADSHEET_ID` 未設定）
③未デプロイ／`/dev` のURL ④コードの貼り付けが途中で切れている。

### 4-2. 「幹の損傷」の定義が未確定【推定のまま】

紙の凡例（記入ルールと運用 3.）に定義が無い。すぐ上の「空洞・傷」が
*穴・樹皮の広範囲な剥離・割れ目* を拾うので、区別の基準を確認したい。
いまは `inspection.js` の `TRUNK_DAMAGE` の hint に
「幹の傷んでいるところ。気になったら『有』」と暫定で置いている。

### 4-3. 小さいもの

- 公開URL（Pages）の実表示はこの環境から確認できていない（外部への到達が制限されている）
- 紙のルール「一度使った番号は二度と使わない」に対し、アプリは最大値+1なので
  **いちばん大きい番号の記録を消すと同じ番号を再提案する**（CLAUDE.md 14-2 に明記済み）
- チェックシートの2ページ目「記入ルールと運用」は
  https://docs.google.com/document/d/1NOkbwYxfhUFfOtEQHwym85btlLJhdA2Kg7VlNIzGkXg/ にある

---

© 2026 Koh Kitsukawa. All rights reserved.
