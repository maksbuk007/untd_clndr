// Загрузка месяца для публичного календаря: память → localStorage → быстрый CDN
import { api } from './api.js';
import { toKey } from './dates.js';
import { setCategories, toEvent } from './utils.js';

const TTL = 60_000;
const mem = new Map();
const keyOf = v => `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}`;
const byDate = (a, b) => a.key.localeCompare(b.key) || a.time.localeCompare(b.time);
const list = arr => arr.map(toEvent).filter(Boolean).sort(byDate);

function apply(raw) {
  setCategories(raw.categories ?? []);
  return { events: list(raw.events), upcoming: list(raw.upcoming) };
}

// Мгновенная отрисовка из сохранённого ответа, пока идёт запрос
export function peek(view) {
  try {
    const saved = localStorage.getItem('cal:' + keyOf(view));
    return saved ? apply(JSON.parse(saved)) : null;
  } catch { return null; }
}

async function fetchRaw(key, force) {
  const first = window.__first; // запрос, начатый ещё в boot.js
  if (!force && first && first.key === key && !first.used) {
    first.used = true;
    try { const r = await first.promise; if (r.ok) return await r.json(); } catch { /* запасной путь ниже */ }
  }
  return api(`/api/calendar?month=${key}&t=${toKey(new Date())}`, { cache: force ? 'reload' : 'default' });
}

export async function loadMonth(view, force = false) {
  const key = keyOf(view);
  const hit = mem.get(key);
  if (!force && hit && Date.now() - hit.t < TTL) { setCategories(hit.raw.categories ?? []); return hit.data; }
  const raw = await fetchRaw(key, force);
  const data = apply(raw);
  mem.set(key, { t: Date.now(), raw, data });
  try { localStorage.setItem('cal:' + key, JSON.stringify(raw)); } catch { /* ignore */ }
  return data;
}
