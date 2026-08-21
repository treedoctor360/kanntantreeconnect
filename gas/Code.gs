/**
 * かんたん樹木登録 — スプレッドシート中継 Web App  v1.1
 *
 * v1.0 → v1.1 の変更点
 *  - 初回リクエストが遅くてタイムアウトするのを直した（書式設定の呼び出しを列ごと→まとめて）
 *  - ブラウザでURLを開くと自己診断のJSONを返すようにした（doGet）
 *  - スタンドアロンで作った場合のエラー文を具体的にし、SPREADSHEET_ID にURLも入れられるようにした
 *  - 1回の実行の中でシートを取り直さないようにした（速度）
 *
 * 役割: アプリ（GitHub Pages）からの POST を受けて、
 *       このスクリプトが紐づくスプレッドシートに公園・樹木を読み書きする。
 *
 * 受け付ける action（本文はJSON文字列。Content-Type は text/plain で届く）:
 *   { action:"ping" }                                   … 疎通確認。シート名と件数を返す
 *   { action:"pull", since:null }                       … シートの全内容を返す（起動時の反映）
 *   { action:"push", parks:[], trees:[], deletions:[] }  … 端末の変更を書き込む（自動保存）
 *
 * 突き合わせ規則（アプリ側 src/lib/syncMerge.js と同じ）:
 *   - id が一致したら updatedAt（更新日時）の新しい方を採用する
 *   - 知らない id は追加する
 *   - 削除は deletions シート（tombstone＝墓標）で伝える。削除より後に更新された
 *     レコードは消さない
 *
 * 写真は受け取らない。Base64画像はセルの上限（5万文字）を超えるため、
 * 端末内（IndexedDB）とJSONバックアップで扱う。
 *
 * 設置手順は gas/README.md を参照。
 *
 * © 2026 Koh Kitsukawa. All rights reserved.
 */

/**
 * シートごとの列。ここに並べた順にそのまま列になる。
 *
 * trees の並びは国土交通省の樹木点検票(個表)の項目に合わせてある:
 *   場所（parkCode）/ テープ番号 / 樹木番号 / 樹種 / 重点観察 / 樹高 / 葉の茂り /
 *   キノコ / キノコ部位 / 空洞・傷 / 空洞・傷の位置 /
 *   樹幹の揺らぎ / 樹幹の不自然な傾斜 / 樹幹の亀裂 / 結合部の異常(入り皮) / フラス /
 *   活力度(樹勢・樹形) / 周辺環境（道路園路・電線・建物・備考）/
 *   注意 / 写真（枚数）… に続けて、
 *   表頭の 調査日 / 調査者 / テープロール、そのあとアプリ固有の座標などを置く。
 *   trunkDamageLegacy は旧「幹の損傷」の退避列（要再確認の目印。新規入力はしない）。
 *
 * 段階もの（leafDensity・vigor・treeForm）の値は 1〜4。意味は「凡例」シート/凡例CSVを参照。
 * alertLevel は重点観察区分（3=重点/2=注意/1=通常/0=未点検）。
 *
 * 列を変えたら、アプリ側（src/lib/inspection.js・src/lib/io.js の CSV_COLUMNS・保存処理）と
 * gas/README.md の表も一緒に直すこと。
 * 既にシートを作ったあとで列を変えた場合は、getSheet_ が見出し行を作り直し、
 * 既存の行を新しい列の位置へ並べ替える（下の ensureHeaders_ 参照）。
 */
var VERSION = 'v1.2';

var SHEETS = {
  parks: ['id', 'code', 'name', 'lat', 'lng', 'note', 'pid', 'lastUsedAt', 'createdAt', 'updatedAt'],
  trees: [
    'id', 'parkId', 'parkCode',
    'tapeNo', 'treeNo', 'species', 'alertLevel', 'height',
    'leafDensity', 'fungus', 'fungusPart',
    'cavity', 'cavityPart',
    'trunkSway', 'trunkLean', 'trunkCrack', 'barkInclusion', 'frass',
    'vigor', 'treeForm',
    'envRoad', 'envWire', 'envBuilding', 'envNote',
    'caution', 'photoCount',
    'surveyDate', 'surveyor', 'tapeRoll',
    'lat', 'lng', 'accuracy', 'coordSource',
    'girth', 'note', 'trunkDamageLegacy', 'registeredAt', 'updatedAt',
  ],
  deletions: ['id', 'table', 'at'],
};

/** 数値として扱う列。それ以外は文字列（日時がDateに化けないよう書式を「書式なしテキスト」にする） */
var NUMBER_FIELDS = ['lat', 'lng', 'accuracy', 'height', 'girth', 'photoCount', 'alertLevel'];

/** アプリと同期する実体のシート（deletions は削除の記録なので別扱い） */
var DATA_SHEETS = ['parks', 'trees'];

// ------------------------------------------------------------------
// 入口
// ------------------------------------------------------------------

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000); // 同時に複数の端末から来ても順番に処理する
  } catch (err) {
    return json_({ ok: false, error: '混み合っています。少し待ってからもう一度お試しください。' });
  }
  try {
    var body = {};
    if (e && e.postData && e.postData.contents) body = JSON.parse(e.postData.contents);

    var tokenError = checkToken_(body.token);
    if (tokenError) return json_({ ok: false, error: tokenError });

    switch (body.action) {
      case 'ping':
        return json_(ping_());
      case 'pull':
        return json_(pull_(body));
      case 'push':
        return json_(push_(body));
      default:
        return json_({ ok: false, error: 'action が不明です: ' + body.action });
    }
  } catch (err) {
    return json_({ ok: false, error: String((err && err.message) || err) });
  } finally {
    lock.releaseLock();
  }
}

/**
 * ブラウザで直接開いたとき用の自己診断。
 * 同期がうまくいかないときは、まずこのURL（末尾 /exec）をブラウザで開くこと。
 * JSONが出れば中継そのものは動いている。ログイン画面が出たらデプロイの
 * 「アクセスできるユーザー」が「全員」になっていない。
 */
function doGet() {
  var out = { ok: true, version: VERSION, checks: {} };

  // 1. スプレッドシートに届いているか
  try {
    var ss = book_();
    out.checks.spreadsheet = { ok: true, name: ss.getName(), id: ss.getId() };
  } catch (err) {
    out.ok = false;
    out.checks.spreadsheet = { ok: false, error: String((err && err.message) || err) };
    out.hint = 'スプレッドシートに届いていません。上の error のとおりに直してください。';
    return json_(out);
  }

  // 2. シートを作れるか（初回はここで parks / trees / deletions ができる）
  try {
    var counts = {};
    Object.keys(SHEETS).forEach(function (name) {
      counts[name] = Math.max(0, getSheet_(name).getLastRow() - 1);
    });
    out.checks.sheets = { ok: true, counts: counts };
  } catch (err) {
    out.ok = false;
    out.checks.sheets = { ok: false, error: String((err && err.message) || err) };
    out.hint = 'シートを作れませんでした。シートの編集権限を確認してください。';
    return json_(out);
  }

  // 3. 合言葉の設定
  out.checks.token = {
    required: Boolean(PropertiesService.getScriptProperties().getProperty('SYNC_TOKEN')),
  };

  out.message =
    'このJSONが見えていれば中継は動いています。アプリの設定タブに、いま開いているURL' +
    '（末尾が /exec）をそのまま貼り付けてください。';
  return json_(out);
}

// ------------------------------------------------------------------
// 各 action
// ------------------------------------------------------------------

function ping_() {
  var counts = {};
  Object.keys(SHEETS).forEach(function (name) {
    counts[name] = Math.max(0, getSheet_(name).getLastRow() - 1);
  });
  return { ok: true, spreadsheet: book_().getName(), counts: counts, at: new Date().toISOString() };
}

/**
 * シートの内容を返す。
 * since（ISO日時）を渡すと、それより後に更新されたものだけを返す。
 */
function pull_(body) {
  var since = body && body.since ? String(body.since) : '';
  var out = { ok: true, at: new Date().toISOString() };

  DATA_SHEETS.forEach(function (name) {
    var rows = readAll_(name);
    out[name] = since ? rows.filter(function (r) { return String(r.updatedAt || '') > since; }) : rows;
  });

  var dels = readAll_('deletions');
  out.deletions = since ? dels.filter(function (d) { return String(d.at || '') > since; }) : dels;
  return out;
}

/** 端末から届いた変更をシートに書く */
function push_(body) {
  var result = { ok: true, at: new Date().toISOString() };

  DATA_SHEETS.forEach(function (name) {
    var records = (body && body[name]) || [];
    result[name] = records.length ? upsert_(name, records) : { added: 0, updated: 0, skipped: 0 };
  });

  var dels = (body && body.deletions) || [];
  result.deletions = dels.length ? applyDeletions_(dels) : { recorded: 0, removed: 0 };
  return result;
}

// ------------------------------------------------------------------
// シート操作
// ------------------------------------------------------------------

function book_() {
  if (bookCache_) return bookCache_;
  // スプレッドシートに紐づけて作った場合（拡張機能 → Apps Script）はそのまま使う。
  // スタンドアロンで作った場合はスクリプトプロパティ SPREADSHEET_ID を見る。
  // SPREADSHEET_ID にはIDでもシートのURLでも入れてよい。
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (id) {
    var m = /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/.exec(id);
    bookCache_ = SpreadsheetApp.openById(m ? m[1] : String(id).trim());
    return bookCache_;
  }
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active) {
    throw new Error(
      'スプレッドシートが見つかりません。このスクリプトがシートに紐づいていない' +
        '（スタンドアロンで作った）ようです。スプレッドシートを開いて' +
        '「拡張機能 → Apps Script」から作り直すか、プロジェクトの設定 → スクリプト プロパティで' +
        ' SPREADSHEET_ID にシートのURLを登録してください。',
    );
  }
  bookCache_ = active;
  return bookCache_;
}

// 1回の実行の中で使い回す控え（同じシートを何度も取りに行かないため）
var bookCache_ = null;
var sheetCache_ = {};

/** シートを取り出す（無ければ見出し付きで作る。列が変わっていれば作り直す） */
function getSheet_(name) {
  if (sheetCache_[name]) return sheetCache_[name];
  var ss = book_();
  var sheet = ss.getSheetByName(name);
  var headers = SHEETS[name];
  if (!sheet) {
    sheet = ss.insertSheet(name);
    writeHeaders_(sheet, headers);
  } else {
    ensureHeaders_(sheet, headers);
  }
  sheetCache_[name] = sheet;
  return sheet;
}

/**
 * 見出し行を書き、日時が日付型に化けないよう書式を整える。
 *
 * 列ごとに setNumberFormat を呼ぶと、1列1000行 × 列数ぶんの書き込みになり、
 * 初回リクエストだけ極端に遅くなる（アプリ側がタイムアウトする）。
 * そこで「シート全体を書式なしテキストにしてから、数値列だけ数値に戻す」という
 * 二段構えにして、呼び出し回数を数回に抑えている。
 */
function writeHeaders_(sheet, headers) {
  var rows = sheet.getMaxRows();
  // まとめて「書式なしテキスト」に（ISO日時が日付型に変換されるのを防ぐ）
  sheet.getRange(1, 1, rows, headers.length).setNumberFormat('@');
  // 数値として扱う列だけ戻す
  headers.forEach(function (h, i) {
    if (NUMBER_FIELDS.indexOf(h) >= 0) {
      sheet.getRange(2, i + 1, rows - 1, 1).setNumberFormat('0.############');
    }
  });
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  sheet.setFrozenRows(1);
}

/**
 * 既にあるシートの見出しが SHEETS の並びと違っていたら、並べ替えて作り直す。
 *
 * 列を足した／並びを変えたあとに古いシートをそのまま使うと、
 * 値が1列ずつずれて入るという分かりにくい壊れ方をする。それを防ぐため、
 * 古い見出しでいったん読んでから、新しい列の位置へ入れ直す。
 * 新しい列は空欄、消えた列の値は捨てられる（消す前に手で控えを取ること）。
 */
function ensureHeaders_(sheet, headers) {
  var width = Math.max(sheet.getLastColumn(), headers.length);
  var current = sheet.getRange(1, 1, 1, width).getValues()[0].map(function (v) {
    return String(v || '');
  });
  var same = headers.every(function (h, i) { return current[i] === h; }) &&
    current.slice(headers.length).every(function (v) { return v === ''; });
  if (same) return;

  var last = sheet.getLastRow();
  var rows = last > 1 ? sheet.getRange(2, 1, last - 1, width).getValues() : [];
  var moved = rows.map(function (row) {
    return headers.map(function (h) {
      var from = current.indexOf(h);
      return from >= 0 ? row[from] : '';
    });
  });

  sheet.clear();
  writeHeaders_(sheet, headers);
  if (moved.length) sheet.getRange(2, 1, moved.length, headers.length).setValues(moved);
}

/** セルの値をJSON向けに整える */
function fromCell_(field, value) {
  if (value instanceof Date) return value.toISOString();
  if (NUMBER_FIELDS.indexOf(field) >= 0) {
    if (value === '' || value === null || value === undefined) return null;
    var n = Number(value);
    return isFinite(n) ? n : null;
  }
  if (value === null || value === undefined) return '';
  return String(value);
}

/** JSONの値をセル向けに整える */
function toCell_(field, value) {
  if (value === null || value === undefined) return '';
  if (NUMBER_FIELDS.indexOf(field) >= 0) {
    var n = Number(value);
    return isFinite(n) ? n : '';
  }
  return String(value);
}

/** シートの全行をオブジェクトの配列で返す */
function readAll_(name) {
  var sheet = getSheet_(name);
  var headers = SHEETS[name];
  var last = sheet.getLastRow();
  if (last < 2) return [];
  var values = sheet.getRange(2, 1, last - 1, headers.length).getValues();
  var out = [];
  for (var i = 0; i < values.length; i++) {
    var id = String(values[i][0] || '');
    if (!id) continue;
    var rec = {};
    for (var c = 0; c < headers.length; c++) rec[headers[c]] = fromCell_(headers[c], values[i][c]);
    out.push(rec);
  }
  return out;
}

/** id をキーに「行番号」を引ける表を作る */
function rowIndex_(sheet, headerLength) {
  var last = sheet.getLastRow();
  var map = {};
  if (last < 2) return { map: map, values: [], last: last };
  var values = sheet.getRange(2, 1, last - 1, headerLength).getValues();
  for (var i = 0; i < values.length; i++) {
    var id = String(values[i][0] || '');
    if (id) map[id] = i + 2; // 実際の行番号
  }
  return { map: map, values: values, last: last };
}

/**
 * レコードを追加・更新する。
 * 既にある id は updatedAt の新しい方を残す（同じ日時なら届いた方で上書き）。
 */
function upsert_(name, records) {
  var sheet = getSheet_(name);
  var headers = SHEETS[name];
  var idx = rowIndex_(sheet, headers.length);
  var updatedCol = headers.indexOf('updatedAt');

  var appends = [];
  var updated = 0;
  var skipped = 0;

  for (var i = 0; i < records.length; i++) {
    var rec = records[i];
    if (!rec || !rec.id) continue;
    var row = headers.map(function (h) { return toCell_(h, rec[h]); });
    var at = idx.map[String(rec.id)];
    if (!at) {
      appends.push(row);
      idx.map[String(rec.id)] = -1; // 同じ回に同じidが2度来ても二重に足さない
      continue;
    }
    if (at < 0) continue;
    var cur = idx.values[at - 2];
    var curUpdated = cur[updatedCol] instanceof Date
      ? cur[updatedCol].toISOString()
      : String(cur[updatedCol] || '');
    if (String(rec.updatedAt || '') >= curUpdated) {
      sheet.getRange(at, 1, 1, headers.length).setValues([row]);
      updated++;
    } else {
      skipped++;
    }
  }

  if (appends.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, appends.length, headers.length).setValues(appends);
  }
  return { added: appends.length, updated: updated, skipped: skipped };
}

/**
 * 削除を反映する。
 *   1. deletions シートに記録を残す（他の端末に削除を伝えるため）
 *   2. 対象シートから該当行を消す（ただし削除より後に更新されていたら消さない）
 */
function applyDeletions_(dels) {
  var recorded = 0;
  var removed = 0;

  // 1. 記録（すでに同じidがあれば足さない）
  var delSheet = getSheet_('deletions');
  var delHeaders = SHEETS.deletions;
  var known = rowIndex_(delSheet, delHeaders.length).map;
  var newRows = [];
  for (var i = 0; i < dels.length; i++) {
    var d = dels[i];
    if (!d || !d.id || DATA_SHEETS.indexOf(d.table) < 0) continue;
    if (known[String(d.id)]) continue;
    known[String(d.id)] = -1;
    newRows.push([String(d.id), String(d.table), String(d.at || new Date().toISOString())]);
  }
  if (newRows.length) {
    delSheet
      .getRange(delSheet.getLastRow() + 1, 1, newRows.length, delHeaders.length)
      .setValues(newRows);
    recorded = newRows.length;
  }

  // 2. 実体の削除。行番号の大きい方から消さないと行がずれる。
  DATA_SHEETS.forEach(function (name) {
    var targets = dels.filter(function (d) { return d && d.table === name && d.id; });
    if (!targets.length) return;
    var sheet = getSheet_(name);
    var headers = SHEETS[name];
    var idx = rowIndex_(sheet, headers.length);
    var updatedCol = headers.indexOf('updatedAt');

    var rows = [];
    targets.forEach(function (d) {
      var at = idx.map[String(d.id)];
      if (!at || at < 0) return;
      var cur = idx.values[at - 2];
      var curUpdated = cur[updatedCol] instanceof Date
        ? cur[updatedCol].toISOString()
        : String(cur[updatedCol] || '');
      // 削除より後に更新されていたら、その更新を優先して消さない
      if (curUpdated > String(d.at || '')) return;
      rows.push(at);
    });
    rows.sort(function (a, b) { return b - a; });
    rows.forEach(function (r) {
      sheet.deleteRow(r);
      removed++;
    });
  });

  return { recorded: recorded, removed: removed };
}

// ------------------------------------------------------------------
// 補助
// ------------------------------------------------------------------

/**
 * 合言葉の確認。スクリプトプロパティ SYNC_TOKEN を設定したときだけ効く。
 * 設定していなければ誰でも読み書きできる（URLを知っている人だけ、という前提）。
 */
function checkToken_(token) {
  var expected = PropertiesService.getScriptProperties().getProperty('SYNC_TOKEN');
  if (!expected) return null;
  if (String(token || '') === expected) return null;
  return '合言葉が違います（アプリの設定タブの「合言葉」を確認してください）。';
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

/**
 * 古い削除の記録を片づける（手で実行する用）。
 * 既定では90日より前の記録を消す。すべての端末が同期を済ませたあとに実行すること。
 */
function pruneDeletions() {
  var days = 90;
  var limit = new Date(Date.now() - days * 86400000).toISOString();
  var sheet = getSheet_('deletions');
  var last = sheet.getLastRow();
  if (last < 2) return;
  var values = sheet.getRange(2, 1, last - 1, SHEETS.deletions.length).getValues();
  for (var i = values.length - 1; i >= 0; i--) {
    var at = values[i][2] instanceof Date ? values[i][2].toISOString() : String(values[i][2] || '');
    if (at && at < limit) sheet.deleteRow(i + 2);
  }
}
