// 公園名の表記ゆれ照合。
// parktreenote（樹木台帳メモ）の normalizeParkKey / findParkMatch / parkCandidates を
// 移植したもの。向こうは公園マスタとの突き合わせに使っているが、本アプリでは
// 「同じ公園を二重に登録してしまう」のを防ぐために使う。
// （公園が二重になると、その公園の樹木が黙って2つに割れてしまう）

/** 照合用キー正規化: 空白除去・全角半角統一・ヶ→ケ・漢数字→算用数字 */
export function normalizeParkKey(s) {
  if (!s) return '';
  let t = String(s)
    .normalize('NFKC')
    .replace(/[\s　]/g, '');
  t = t.replace(/ヶ/g, 'ケ').replace(/ヵ/g, 'カ');
  const kan = { 〇: '0', 一: '1', 二: '2', 三: '3', 四: '4', 五: '5', 六: '6', 七: '7', 八: '8', 九: '9' };
  t = t.replace(/[〇一二三四五六七八九]/g, (c) => kan[c]);
  return t.toLowerCase();
}

/** キーが一致する公園を返す。無ければ null（selfId の公園は除く） */
export function findParkByName(parks, name, selfId = null) {
  if (!name) return null;
  const key = normalizeParkKey(name);
  if (!key) return null;
  return parks.find((p) => p.id !== selfId && normalizeParkKey(p.name) === key) ?? null;
}

/** 近い候補を最大3件返す（部分一致・前方一致） */
export function parkCandidates(parks, name, selfId = null) {
  const key = normalizeParkKey(name);
  if (!key) return [];
  return parks
    .filter((p) => {
      if (p.id === selfId) return false;
      const k = normalizeParkKey(p.name);
      return (
        k.includes(key) || key.includes(k) || (key.length >= 2 && k.slice(0, 2) === key.slice(0, 2))
      );
    })
    .slice(0, 3)
    .map((p) => p.name);
}
