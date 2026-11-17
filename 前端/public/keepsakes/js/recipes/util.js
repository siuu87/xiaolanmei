// Small helpers shared by recipes.
const CJK = /[⺀-鿿豈-﫿＀-￯]/;
/** Join name words: a space between Latin words, nothing between CJK ones ("Lantern Hollow", "灯火山谷"). */
export const joinWords = ws => ws.reduce((acc, w) => !acc ? w : (CJK.test(acc.slice(-1)) || CJK.test(w[0]) ? acc + w : acc + ' ' + w), '');
export const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
/** Possessives that disappear when there is no name (solo mode): "Mira's " / "the "; "小林的" / "". */
export const enOf = n => n ? `${n}'s ` : 'the ';
export const zhOf = n => n ? `${n}的` : '';
export const MONTHS_ZH = { January: '一月', February: '二月', March: '三月', April: '四月', May: '五月', June: '六月', July: '七月', August: '八月', September: '九月', October: '十月', November: '十一月', December: '十二月' };
