/** UNIX 秒を「2日前」のような短い言い方にする。 */
export function relTime(sec: number, now = Date.now()): string {
  const d = Math.max(0, Math.floor((now / 1000 - sec)));
  if (d < 60) return "たった今";
  if (d < 3600) return `${Math.floor(d / 60)}分前`;
  if (d < 86400) return `${Math.floor(d / 3600)}時間前`;
  if (d < 86400 * 30) return `${Math.floor(d / 86400)}日前`;
  const t = new Date(sec * 1000);
  return `${t.getFullYear()}/${t.getMonth() + 1}/${t.getDate()}`;
}
