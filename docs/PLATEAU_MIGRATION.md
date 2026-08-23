# PLATEAU（CityGML）移行 設計メモ

作成: 2026-08-21 / 対象: `kanntantreeconnect`（かんたん樹木登録＋スプレッドシート連携）

このメモの目的は **「いま集めているデータを、将来PLATEAU（CityGML）へ無駄なく移せる形にしておくこと」**。
移行そのものを今やるのではなく、**今のうちに手当てしておかないと後から取り返せないもの**を特定して、
それだけを先に潰す。

記述の区別:

- 出典を示した記述 … 公的資料・規格文書で確認した**事実**
- 【推定】 … 根拠が取れなかった判断。従うかどうかは要検討
- 【要確認】 … 庁内資料や紙の運用ルールで確かめる必要があるもの

---

## 0. 結論（先に3行）

1. **現行データはほぼそのまま移行できる。** ID設計が既にCityGML向きになっている（後述1-2）。
2. **今のうちに手当てが要るのは3点だけ** — ①点検履歴 ②CityGML必須属性のうち現行に無い4項目 ③樹種の学名対応表。
   いずれも「後から遡って取れない（＝再度現地に行くしかない）」種類の欠落。
3. **座標の標高（Z）は今やらなくてよい。** 移行時に数値標高モデル（DEM）から与えられる。
   スマホGPSの標高は水平位置より誤差が大きく、現場で取っても品質が上がらない。

---

## 1. 現行データの棚卸し

### 1-1. いま持っているフィールド

`gas/Code.gs` の `SHEETS` が実体（アプリのDexie・CSV・シートで同じ並び）。

**trees（樹木1本）**

```
id, parkId, parkCode,
tapeNo, treeNo, species, height,
leafDensity, fungus, fungusPart,
cavity, cavityPart, trunkDamage, barkInclusion, frass,
envRoad, envWire, envBuilding, envNote,
caution, photoCount,
surveyDate, surveyor, tapeRoll,
lat, lng, accuracy, coordSource,
girth, note, registeredAt, updatedAt
```

**parks（公園）**

```
id, code, name, lat, lng, note, pid, lastUsedAt, createdAt, updatedAt
```

写真の実体（Base64）は端末内（IndexedDB）とJSONバックアップにのみ存在し、シートへは枚数だけ送っている。

### 1-2. ID設計はすでにCityGML向きになっている

添付資料が求める「2階層不変設計」（システム主キーと運用表示コードの分離）は、
このアプリでは **意図せずすでに実装されている**。

| 資料の要求 | 現行の実装 | 評価 |
|---|---|---|
| `park_id`：システム主キー、再利用不可 | `parks.id`（UUID、`src/db/db.js` の `uid()`） | ○ そのまま使える |
| `park_display_code`：運用表示コード、変更を許容 | `parks.code`（`P001` 形式、変更可） | ○ そのまま使える |
| 樹木の不変ID | `trees.id`（UUID） | ○ |
| 樹木の表示コード | `trees.treeNo`（`{公園コード}-{テープ番号}`） | ○ |
| 外部台帳との紐付けキー | `parks.pid`（CSV取込で入る既存台帳ID） | ○ `ExternalReference` に流せる |

**注意点**：`updatePark()` は公園コードを変えたとき `renumber` オプションで `treeNo` を振り直す
（`src/db/db.js`）。つまり **`treeNo` は不変ではない**。これは資料が警告する「繰り上がり問題」そのものだが、
不変キーは `id` 側にあるので履歴の紐付けは切れない。**移行時に `gml:id` へ載せるのは `id`（UUID）であり、
`treeNo` ではない**。ここを取り違えると資料が指摘する技術的負債を自分で作り込むことになる。

---

## 2. 受け皿（CityGML / PLATEAU）側の事実確認

### 2-1. SolitaryVegetationObject の属性（CityGML 3.0）

OGC の公式スキーマ文書で確認した、単木に定義されている属性は以下がすべて。

| 要素名 | 型 | 多重度 |
|---|---|---|
| `class` | `gml:CodeType` | 0..1 |
| `function` | `gml:CodeType` | 0..* |
| `usage` | `gml:CodeType` | 0..* |
| `species` | `gml:CodeType` | 0..1 |
| `height` | `gml:LengthType` | 0..1 |
| `trunkDiameter` | `gml:LengthType` | 0..1 |
| `crownDiameter` | `gml:LengthType` | 0..1 |
| `rootBallDiameter` | `gml:LengthType` | 0..1 |
| `maxRootBallDepth` | `gml:LengthType` | 0..1 |

PlantCover（植込み・植生面）は `class` / `function` / `usage` / `averageHeight` / `minHeight` / `maxHeight`。
**単木にある `species`・`trunkDiameter`・`crownDiameter` は PlantCover には無い。**

→ 点検内容（キノコ・空洞・フラス等）は**標準属性には存在しない**。すべて拡張（ADE または汎用属性）側へ回る。
これは欠点ではなく、当初からそういう設計の規格である。

### 2-2. 座標参照系 — 添付資料の記述に誤りがある

**PLATEAUのCityGMLは経緯度座標系で提供される。** 国土交通省の解説では
`EPSG:6697`（JGD2011 経緯度＋東京湾平均海面標高の複合座標参照系）が大半、
標高を要しないデータは `EPSG:6668`（JGD2011 経緯度）とされている。

添付資料の SQL にある `GEOMETRY(PointZ, 6675)` と「例: 6675 (JGD2011 / 9系)」という記述は、
**二重に誤っている**（EPSG登録簿で確認）。

| 添付資料の記述 | 実際 |
|---|---|
| 6675 =「9系」 | `EPSG:6675` は **VI系ではなく VII系**（岐阜・石川・富山・愛知）。IX系は `EPSG:6677` |
| 滋賀県に 6675 を使う | 滋賀県は **VI系＝`EPSG:6674`**（京都・大阪・福井・滋賀・三重・奈良・和歌山） |

したがって大津市で平面直角座標系を使うなら `EPSG:6674`。
ただし **CityGML出力は経緯度（6697）なので、平面直角はRDBMS内部の作業用にすぎない**。

**現行アプリへの影響：無し。** `lat` / `lng` はWGS84相当の10進度で保存しており（`src/lib/geo.js`）、
JGD2011の経緯度とは実用上の差が無い。変換は移行時にまとめてやればよい。

### 2-3. 大津市はPLATEAU未整備（2026年8月時点）

国土交通省のオープンデータ一覧に滋賀県で掲載されているのは **近江八幡市（2025年度）と長浜市（2024年度）** のみで、
**大津市の3D都市モデルは公開されていない**。

これは提案の組み立てに直結する。「既存のPLATEAUデータに樹木を足す」話ではなく、
**「大津市がPLATEAUに参加するときに、樹木レイヤだけは先にデータが揃っている」** という順序になる。
近江八幡市・長浜市が先行しているので、県内先行事例として参照できる。

---

## 3. ギャップ表（現行 → CityGML）

判定：○＝そのまま移行可 / △＝変換または補完が要る / ×＝現行に無く、新規取得が要る

| # | CityGML側 | 現行フィールド | 判定 | 内容 |
|---|---|---|---|---|
| 1 | `gml:id` | `trees.id` | ○ | UUID。不変。そのまま |
| 2 | `gml:name` | `trees.treeNo` | ○ | 表示コード。命名規則は5章 |
| 3 | `veg:height` | `height` | ○ | 単位はどちらもm。**目測値である旨の精度注記が要る** |
| 4 | `veg:species` | `species` | △ | 和名の自由入力。学名コードリストへの対応表が要る（4-3） |
| 5 | `veg:trunkDiameter` | `girth` | △ | 幹周(cm)→直径(m)は `girth / π / 100`。**測定高が未記録**（4-2） |
| 6 | `veg:crownDiameter` | — | × | **現行に無い**（4-2） |
| 7 | `veg:class` | — | × | 高木/低木の区分が**現行に無い**（4-2） |
| 8 | `gml:Point`（Z含む） | `lat` / `lng` | △ | Zが無い。**移行時にDEMから付与でよい**（0章3） |
| 9 | 品質メタデータ | `accuracy` / `coordSource` | ○ | 位置精度の根拠。捨てずに残す価値が大きい |
| 10 | `ExternalReference` | `parks.pid` | ○ | 既存台帳IDとの橋渡し |
| 11 | 拡張属性（健全度） | `leafDensity` | △ | 濃/普/ま/ほ。国・日本緑化センターの健全度定義とは別物【要確認】 |
| 12 | 拡張属性（腐朽菌） | `fungus` / `fungusPart` | △ | **有/無/未の3値。BOOLEANにすると「未」が消える**（4-4） |
| 13 | 拡張属性（損傷） | `cavity` `cavityPart` `trunkDamage` `barkInclusion` `frass` | ○ | 文字列のまま拡張属性へ |
| 14 | 拡張属性（周辺環境） | `envRoad` `envWire` `envBuilding` `envNote` | ○ | 同上 |
| 15 | 拡張属性（所見） | `caution` / `note` | ○ | 同上 |
| 16 | 点検日 | `surveyDate` | ○ | `last_inspection` に相当 |
| 17 | 点検者 | `surveyor` / `tapeRoll` | ○ | 拡張属性 |
| 18 | 写真 | `photoCount` ＋ IndexedDB | △ | 実体はシートに無い。置き場の決定が要る（6章） |
| 19 | 作成・更新日時 | `registeredAt` / `updatedAt` | ○ | |
| 20 | **点検履歴** | — | **×** | **最新値の上書きのみ。過去が残らない**（4-1） |
| 21 | `PlantCover`（植込み） | — | × | 単木のみのアプリ。現時点では対象外でよい（6章） |

---

## 4. 今のうちにやる4点

### 4-1.【最優先】点検履歴を残す — GASシートに `tree_history` を追加

> **2026-08-23 実装済み**（`gas/Code.gs` v1.3 の `appendHistory_`）。
> 列は下の案から変わり、**`trees` の全列＋`historyId`/`recordedAt`** にした
> （`SHEETS.tree_history = ['historyId','recordedAt'].concat(SHEETS.trees)`）。
> こうすると trees に列を足したとき履歴側も自動でついてくる。
> 反映には **v1.3 の貼り付け・再デプロイが必要**。

**問題**：現行は同じ木を2回目に点検すると、`trees` の行が上書きされて前回の値が消える。
「3年前は葉の茂りが『普』だった木が、いま『ま』になっている」という**経年変化が、いま毎日失われ続けている**。
これは移行の話以前に、樹木診断のデータとして最も価値が高い部分。

**方針（合意済み）**：アプリのDB構造は変えず、**GAS側にappend-onlyの履歴シートを1枚足す**。

```
tree_history: historyId, treeId, treeNo, parkCode, recordedAt,
              surveyDate, surveyor,
              height, leafDensity, fungus, fungusPart,
              cavity, cavityPart, trunkDamage, barkInclusion, frass,
              envRoad, envWire, envBuilding, envNote, caution,
              girth, photoCount
```

- `Code.gs` の push 処理で、`trees` を書き込む直前に**同じ内容を `tree_history` へ追記**する（更新も新規も）
- 追記のみ。既存行は絶対に書き換えない
- `historyId` は `{treeId}_{updatedAt}` で一意にし、同じ内容の再送で重複しないようにする
- アプリ側の変更は不要（push の中身は今のまま）

**この方式を選んだ理由**：アプリのDexieに `inspections` テーブルを新設すると、登録フォーム・一覧・CSV・GASのすべてに
波及して既存84テストを壊す。履歴の**記録**だけならシート側で完結でき、
CityGML 3.0 の Versioning / Dynamizer へはシートから流し込める。
アプリ側で履歴を**閲覧**したくなった時点で、改めてDexie側を検討すればよい。

【推定】履歴の閲覧UIは当面不要と見ている。現場で必要なのは「今の状態」であり、
経年比較は事務所でシートを見れば足りる。

### 4-2. 任意入力の属性を4つ追加

> **2026-08-23 実装済み**（`crownWidth` / `vegClass` / `girthHeight`）。
> **`girthHeight` の【要確認】は解決**: 大津市の運用は **地上高 1.2m（日本の胸高）**。
> 幹周を入力した時点で `1.2` が自動で入り、違う高さで測ったときだけ押し替える形にした
> （`DEFAULT_GIRTH_HEIGHT`）。値は `1.2` / `1.3` / `根元` / `その他`。
> `根元` が入るため、シートでは数値列にしていない。

いずれも **`INSPECTION_FIELDS` に足して、入力は任意**（空欄を許す）。現場の入力負担を増やさない。

| 追加フィールド | 画面ラベル | 型・選択肢 | 理由 |
|---|---|---|---|
| `crownWidth` | 樹冠幅 | 数値(m)・プリセット押下（3/5/8/10/15） | `veg:crownDiameter`。LOD2の樹冠（回転楕円体）生成に必須 |
| `vegClass` | 区分 | 高木 / 中木 / 低木 | `veg:class`。CodeList対応 |
| `girthHeight` | 幹周測定高 | 1.2m / 1.3m / 根元 / その他 | `veg:trunkDiameter` の意味を確定させる。**後から遡れない** |

【推定】樹冠は「幅」1項目で足りると考えている。CityGMLの `crownDiameter` は水平投影の最大直径1値なので、
長径・短径を分けて取る必要はない。

**`girthHeight` が地味に重要**：胸高直径は測定高が分からないと比較できない。
既存の `girth` データが 1.2m なのか 1.3m なのか根元なのかが今後わからなくなると、
**その幹周データは診断根拠として使えなくなる**。
→ **確認済み（2026-08-23）: 大津市の運用は地上高 1.2m。** 既定値をそれにした。

樹高プリセットと同じ「よく使う値をタップ」方式にすれば、入力は1タップで済む。

### 4-3. 樹種の学名対応表（アプリ側マスタ）

`veg:species` はコードリスト型（`gml:CodeType`）で、和名の自由入力のままでは移行できない。

**方針**：樹木レコードには学名を持たせず、**設定の樹種マスタに「和名 → 学名」の対応を持たせる**。
既存データは和名のまま置いておき、移行時に対応表で一括変換する。

```
settings.speciesMaster: ['ソメイヨシノ', 'クスノキ', ...]           ← 現行
settings.speciesSci:    { 'ソメイヨシノ': 'Cerasus × yedoensis',   ← 追加
                          'クスノキ': 'Cinnamomum camphora', ... }
```

こうすると、**すでに登録済みの樹木データを一切触らずに**学名を後付けできる。
表記ゆれ（「ソメイヨシノ」「染井吉野」）は対応表側で吸収する。

【推定】学名の典拠は『日本産維管束植物目録』（YList）系に揃えるのが妥当と考えるが、
中島樹木クリニックや大津市の既存台帳がどの典拠を使っているかに合わせるほうが実務的。【要確認】

### 4-4. 「未」を潰さない

添付資料の SQL は `fungi_presence BOOLEAN DEFAULT FALSE` としている。
これを素直に採用すると、**アプリが慎重に区別している「無（見たが無かった）」と「未（見ていない・見えない）」が
どちらも FALSE に潰れる**。

「見て無かった」と「見ていない」は、危険木のスクリーニングでは意味がまったく違う。
`fungus` / `frass` は **BOOLEAN にせず、文字列（有/無/未）のまま拡張属性へ渡す**こと。
どうしても真偽値が要る場面では `有 → TRUE`、`無 → FALSE`、`未 → NULL` の3値にする。

これは移行時にコードを書く人（＝将来の自分か委託先）が確実に踏む罠なので、明記しておく。

---

## 5. ID命名規則の確定

添付資料の推奨（`[JIS自治体コード]-[公園・施設ID]-[個体一連番号]`）に従う。
資料の例 `04100-TSUTSUJIGAOKA-0001` は仙台市の全国地方公共団体コード。

**大津市は `25201`**（滋賀県大津市）。

```
gml:name  = 25201-{公園コード}-{4桁連番}     例: 25201-P001-0001   ← 表示・人が読む
gml:id    = trees.id（UUID）                                        ← 不変・機械が読む
```

- `gml:name` は公園コード変更で変わりうる（1-2）。**変わってよい**。
- 過去の点検ログとのリレーションは `gml:id`（UUID）だけを見る。
- 現行の `treeNo`（`P001-A201`）はテープ番号ベースで、公園内で連続していない。
  移行時に `gml:name` 用の4桁連番を別途振ることになる。**現行の treeNo は捨てず、
  拡張属性 `tapeTreeNo` として残す**（紙の記録との照合に要る）。

---

## 6. 今回はやらないこと

| 項目 | 判断 |
|---|---|
| PlantCover（植込み・植生面） | 単木のアプリなので対象外。必要になったら別スキーマで足す |
| PostGIS の構築 | 移行が決まってからでよい。今はシートで足りる |
| 写真の置き場 | IndexedDB に置いたまま。クラウド保管は別途検討【要確認：庁内の写真データの取扱規程】 |
| 座標の標高（Z） | 現地では取らない。移行時にDEMから付与 |
| 平面直角座標系への変換 | 移行時に一括変換。アプリは経緯度のまま |
| U-GREEN API / CFD解析 | データが揃ってからの話。今の設計判断には影響しない |

---

## 7. 未確定事項（【要確認】の一覧）

1. **幹周の測定高** — 紙のチェックシートに指定があるか。無ければ運用で決める必要がある
2. **健全度の定義** — `leafDensity`（濃/普/ま/ほ）を、国・日本緑化センター・日本樹木医会の
   健全度／活力度の定義にどう対応させるか。現行は独自区分であり、標準の健全度そのものではない
3. **学名の典拠** — 既存台帳・転職先がどの目録に準拠しているか
4. **公園数** — 添付資料の「都市公園224箇所・児童公園664箇所」は出典が確認できなかった。
   （民間の指定管理実績サイトには「大津市都市公園（225公園）」という記載があるが年次不明）
   **庁内の公園台帳で正確な数を確認すること。**提案書に載せる数字を推定で書かない
5. **「幹の損傷」の定義** — HANDOVER.md 4-2 から継続。紙の凡例に定義が無く、暫定のまま

---

## 8. 作業の順序（提案）

| 順 | 内容 | 規模 |
|---|---|---|
| 1 | `gas/Code.gs` に `tree_history` シートを追加（4-1） | 小。GAS側のみ。**Kohによる貼り付け・再デプロイが要る** |
| 2 | `crownWidth` / `vegClass` / `girthHeight` を追加（4-2） | 中。4か所そろえる（`inspection.js` → 登録フォーム → `io.js` → `Code.gs`） |
| 3 | `settings.speciesSci` と設定画面の対応表UI（4-3） | 中 |
| 4 | 変換スクリプトの試作（CSV → PostGIS投入SQL / CityGML） | 移行が現実味を帯びてから |

1と2は独立しているので、どちらからでもよい。**1を先にやるほど、失われる履歴が少ない。**

---

## 9. 出典

- OGC CityGML 3.0 Vegetation module スキーマ文書 — <https://opengeospatial.github.io/CityGML-3.0Encodings/xsd-doc/3.0/vegetation/>
- 国土交通省 PLATEAU「3D都市モデルデータの基本」（座標参照系 6697 / 6668） — <https://www.mlit.go.jp/plateau/learning/tpc03-1/>
- 国土交通省 PLATEAU 3D都市モデルオープンデータ一覧（滋賀県＝近江八幡市・長浜市） — <https://www.mlit.go.jp/plateau/open-data/>
- EPSG:6674 JGD2011 / Japan Plane Rectangular CS VI（適用範囲に滋賀県） — <https://epsg.io/6674>
- 国土地理院 わかりやすい平面直角座標系 — <https://www.gsi.go.jp/sokuchikijun/jpc.html>
- 標準地域コード 滋賀県大津市（25201） — <https://geoshape.ex.nii.ac.jp/city/code/25201.html>
- 3D都市モデル標準製品仕様書（PLATEAU公式ドキュメント） — <https://www.mlit.go.jp/plateaudocument/>

---

© 2026 Koh Kitsukawa. All rights reserved.
