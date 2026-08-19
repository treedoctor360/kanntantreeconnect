// 端末内DBを書き換えたことを知らせるだけの小さな伝言板。
//
// db.js（保存する側）と sync.js（GASへ送る側）を直接つなぐと
// 「db.js → sync.js → db.js」と輪になって読み込めなくなる（循環参照）。
// 間にこのファイルを挟むことで、db.js は「変えた」と言うだけ、
// sync.js は「変わったら送る」だけ、という関係にしている。

const listeners = new Set();

/** 変更を受け取る。戻り値を呼ぶと購読をやめる。 */
export function onLocalChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** 端末内DBを書き換えたことを知らせる */
export function emitLocalChange(reason = '') {
  for (const fn of [...listeners]) {
    try {
      fn(reason);
    } catch {
      // 購読側の失敗で保存処理を巻き込まない
    }
  }
}
