// スプレッドシート（GAS）と端末内DBの突き合わせ規則。
// ここは「純粋関数」（外部の状態を読まず、引数だけで戻り値が決まる関数）だけを置く。
// DB にもネットワークにも触らないので、node --test でそのまま確かめられる。
//
// 規則は io.js の planMerge（JSONバックアップの追記マージ）と同じ考え方にそろえてある。
//   - id が一致したら updatedAt（更新日時）の新しい方を採用する
//   - 知らない id は追加する
//   - 削除は「削除の記録（tombstone＝墓標）」で伝える。削除の日時より後に
//     端末側で更新されていたら、削除は無視して端末の値を残す

/** 同期の対象にするテーブル。写真（photos）は容量が大きいので端末内に留める。 */
export const SYNC_TABLES = ['parks', 'trees'];

/** ISO日時の新旧比較。ISO 8601 は文字列の辞書順＝時刻順になる。 */
export const isNewer = (a, b) => String(a ?? '') > String(b ?? '');

/**
 * 端末に保存するときに、シート側に無い項目（サムネイル）を消さないよう引き継ぐ。
 * thumb は写真から作る一覧用の縮小画像で、シートには載せていない。
 */
function keepLocalOnly(remote, local) {
  if (!local) return { ...remote };
  const merged = { ...remote };
  if (merged.thumb == null && local.thumb != null) merged.thumb = local.thumb;
  if (!merged.pid && local.pid) merged.pid = local.pid;
  return merged;
}

/**
 * シートから受け取った内容を端末に反映する計画を立てる。
 *
 * @param {{parks:object[], trees:object[]}} local    端末内の全レコード
 * @param {{parks?:object[], trees?:object[], deletions?:{id:string,table:string,at:string}[]}} remote
 * @returns {{parks:{put:object[]}, trees:{put:object[]},
 *            remove:{parks:string[], trees:string[]}, skipped:number}}
 */
export function planPull(local, remote) {
  const plan = {
    parks: { put: [] },
    trees: { put: [] },
    remove: { parks: [], trees: [] },
    skipped: 0,
  };

  const localMaps = {};
  for (const table of SYNC_TABLES) {
    localMaps[table] = new Map((local?.[table] ?? []).map((r) => [r.id, r]));
  }

  for (const table of SYNC_TABLES) {
    for (const rec of remote?.[table] ?? []) {
      if (!rec?.id) continue;
      const cur = localMaps[table].get(rec.id);
      if (!cur) {
        plan[table].put.push({ ...rec });
      } else if (isNewer(rec.updatedAt, cur.updatedAt)) {
        plan[table].put.push(keepLocalOnly(rec, cur));
      } else {
        plan.skipped += 1;
      }
    }
  }

  // 削除の記録。端末に無いものは何もしない。
  // 削除より後に端末で更新していたら、その更新を優先して削除は捨てる（復活させる）。
  for (const del of remote?.deletions ?? []) {
    const table = del?.table;
    if (!del?.id || !SYNC_TABLES.includes(table)) continue;
    const cur = localMaps[table].get(del.id);
    if (!cur) continue;
    if (isNewer(cur.updatedAt, del.at)) {
      plan.skipped += 1;
      continue;
    }
    plan.remove[table].push(del.id);
    // 同じ回のシート内容に put が入っていたら取り消す（削除が後勝ちのため）
    plan[table].put = plan[table].put.filter((r) => r.id !== del.id);
  }

  return plan;
}

/** 反映件数の要約（トーストに出す文言用） */
export function summarizePull(plan) {
  const put = plan.parks.put.length + plan.trees.put.length;
  const removed = plan.remove.parks.length + plan.remove.trees.length;
  return { put, removed, skipped: plan.skipped };
}

/**
 * シートに送る樹木レコードを作る。
 * サムネイル（thumb）は数十KBのBase64なのでシートのセル上限（5万文字）を圧迫する。
 * 写真そのものと同じく端末内に留め、シートには送らない。
 */
export function stripTreeForSheet(tree) {
  const { thumb, ...rest } = tree ?? {};
  return rest;
}

/** 送信の要約（トーストに出す文言用） */
export function summarizePush({ parks = [], trees = [], deletions = [] }) {
  return { records: parks.length + trees.length, deletions: deletions.length };
}
