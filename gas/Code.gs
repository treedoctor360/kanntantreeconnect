/**
 * かんたん樹木登録 — スプレッドシート中継 Web App  v1.0
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

/** シートごとの列。ここに並べた順にそのまま列になる。 */
var SHEETS = {
  parks: ['id', 'code', 'name', 'lat', 'lng', 'note', 'pid', 'lastUsedAt', 'createdAt', 'updatedAt'],
  trees: [
    'id', 'parkId', 'parkCode', 'treeNo', 'species',
    'lat', 'lng', 'accuracy', 'coordSource',
    'height', 'girth', 'note', 'registeredAt', 'updatedAt',
  ],
  deletions: ['id', 'table', 'at'],
};

/** 数値として扱う列。それ以外は文字列（日時がDateに化けないよう書式を「書式なしテキスト」にする） */
var NUMBER_FIELDS = ['lat', 'lng', 'accuracy', 'height', 'girth'];

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

/** ブラウザで直接開いたとき用（動作確認のみ） */
function doGet() {
  return json_({
    ok: true,
    message: 'かんたん樹木登録の中継Web Appです。アプリの設定タブにこのURLを貼り付けてください。',
  });
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
  // スプレッドシートに紐づけて作った場合はそのまま使う。
  // スタンドアロンで作った場合はスクリプトプロパティ SPREADSHEET_ID を見る。
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active) {
    throw new Error(
      'スプレッドシートが見つかりません。スクリプトプロパティ SPREADSHEET_ID を設定してください。',
    );
  }
  return active;
}

/** シートを取り出す（無ければ見出し付きで作る） */
function getSheet_(name) {
  var ss = book_();
  var sheet = ss.getSheetByName(name);
  var headers = SHEETS[name];
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    // 日時（ISO文字列）が勝手に日付として解釈されないよう、数値列以外は「書式なしテキスト」にする
    headers.forEach(function (h, i) {
      if (NUMBER_FIELDS.indexOf(h) < 0) {
        sheet.getRange(1, i + 1, sheet.getMaxRows(), 1).setNumberFormat('@');
      }
    });
  }
  return sheet;
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
