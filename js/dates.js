export const pad = n => String(n).padStart(2, '0');
export const toKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Понимает «15.09.2026», «2026-09-15» и ISO-строки с временем
export function parseDate(value) {
  const s = String(value ?? '').trim();
  if (!s) return null;
  let m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(s);
  return isNaN(d) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function formatTime(value) {
  const s = String(value ?? '').trim();
  if (!s) return '';
  const hm = s.match(/^(\d{1,2}):(\d{2})/);
  if (hm) return `${pad(+hm[1])}:${hm[2]}`;
  const d = new Date(s);
  return isNaN(d) ? s : `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
