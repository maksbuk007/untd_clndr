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

// Границы видимой сетки месяца: с понедельника до воскресенья, целыми неделями
export function gridBounds(view) {
  const y = view.getFullYear(), m = view.getMonth();
  const offset = (new Date(y, m, 1).getDay() + 6) % 7;
  const count = Math.ceil((offset + new Date(y, m + 1, 0).getDate()) / 7) * 7;
  return { start: new Date(y, m, 1 - offset), count };
}

// События по дням; многодневное событие попадает в каждый свой день
export function groupByDay(events) {
  const map = new Map();
  for (const e of events) {
    const last = e.endKey || e.key;
    let d = parseDate(e.key);
    for (let n = 0; n < 62; n++) {
      const key = toKey(d);
      if (key > last) break;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(e);
      d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    }
  }
  return map;
}

/* ---- Арифметика над строками «ГГГГ-ММ-ДД» (UTC, без часовых поясов) ---- */
const toUTC = s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const fromUTC = t => new Date(t).toISOString().slice(0, 10);
export const isRealDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && fromUTC(toUTC(s)) === s;
export const addDays = (s, n) => fromUTC(toUTC(s) + n * 864e5);
export const daysBetween = (a, b) => Math.round((toUTC(b) - toUTC(a)) / 864e5);

export function addMonths(s, n) {
  const d = Number(s.slice(8));
  const first = new Date(Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1 + n, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return fromUTC(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d, last)));
}

export const MAX_REPEATS = 60;
// Даты повторения от first до until включительно (вернёт до MAX_REPEATS + 1 — чтобы заметить превышение)
export function repeatDates(first, every, until) {
  if (!isRealDate(first) || !isRealDate(until) || !every) return [];
  const out = [];
  for (let i = 0; i <= MAX_REPEATS; i++) {
    const d = every === 'month' ? addMonths(first, i) : addDays(first, i * (every === '2weeks' ? 14 : 7));
    if (d > until) break;
    out.push(d);
  }
  return out;
}
