// 公園マスタCSVの読み取り。
// parktreenote（樹木台帳メモ）の parseCsvLine / decodeCsvBuffer / importParkMasterCsv を
// 移植したもの。同じCSV（市の公園一覧など）を両方のアプリに読ませられるよう、
// 見出しの候補と文字コードの扱いを向こうに合わせてある。

/** 公園名の列に使える見出し（parktreenote と同じ順で探す） */
export const NAME_HEADERS = ['児童遊園地名', '公園名', 'タイトル'];
/** 代表座標の列に使える見出し（こちらだけの拡張。無くてもよい） */
const LAT_HEADERS = ['緯度', 'lat', 'Lat', 'latitude'];
const LNG_HEADERS = ['経度', 'lng', 'lon', 'Lng', 'longitude'];

/** CSV 1行パース（ダブルクオート対応） */
export function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = false;
      } else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

/** 文字コード自動判定（UTF-8で化けたらShift_JISで読み直す） */
export function decodeCsvBuffer(buf) {
  let text = new TextDecoder('utf-8').decode(buf);
  if (text.indexOf('�') >= 0) text = new TextDecoder('shift_jis').decode(buf);
  return text.replace(/^﻿/, '');
}

const findCol = (header, candidates) => {
  for (const cand of candidates) {
    const i = header.indexOf(cand);
    if (i >= 0) return i;
  }
  return -1;
};

const toNum = (s) => {
  const t = String(s ?? '').trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/**
 * CSVテキストから公園の行を取り出す。
 * @returns {{ok:true, rows:{name,pid,lat,lng}[]} | {ok:false, reason:string}}
 */
export function parseParkCsv(text) {
  const lines = String(text ?? '')
    .split(/\r?\n/)
    .filter((l) => l.trim());
  if (lines.length < 2) return { ok: false, reason: 'データ行がありません。' };

  const header = parseCsvLine(lines[0]);
  const nameCol = findCol(header, NAME_HEADERS);
  if (nameCol < 0) {
    return {
      ok: false,
      reason: `公園名の列が見つかりません（${NAME_HEADERS.join(' / ')} のいずれかが必要です）。`,
    };
  }
  const idCol = header.indexOf('ID');
  const latCol = findCol(header, LAT_HEADERS);
  const lngCol = findCol(header, LNG_HEADERS);

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const name = (cells[nameCol] ?? '').trim();
    if (!name) continue;
    rows.push({
      name,
      pid: idCol >= 0 ? (cells[idCol] ?? '').trim() : '',
      lat: latCol >= 0 ? toNum(cells[latCol]) : null,
      lng: lngCol >= 0 ? toNum(cells[lngCol]) : null,
    });
  }
  if (!rows.length) return { ok: false, reason: '公園名の入った行がありませんでした。' };
  return { ok: true, rows };
}
