import { APPS_SCRIPT_URL, CACHE_KEY } from './config.js';
import { parseDate, toKey, formatTime } from './dates.js';

const pick = (row, ...keys) => {
  for (const k of keys) {
    const v = row[k];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
};

// «Сырые» строки таблицы → аккуратные объекты, отсортированные по дате и времени
export function normalize(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map(row => {
    const date = parseDate(row['Дата']);
    if (!date) return null;
    return {
      date,
      key: toKey(date),
      title: pick(row, 'Название', 'Название события') || 'Без названия',
      time: formatTime(row['Время']),
      description: pick(row, 'Описание'),
      color: pick(row, 'Цвет').toLowerCase(),
    };
  }).filter(Boolean).sort((a, b) => a.key.localeCompare(b.key) || a.time.localeCompare(b.time));
}

export function readCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY)); } catch { return null; }
}

function writeCache(raw) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), raw })); } catch { /* переполнено/запрещено */ }
}

// Таймаут + одна повторная попытка (Apps Script иногда «просыпается» долго)
export async function fetchEvents({ timeout = 15000, attempts = 2 } = {}) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(APPS_SCRIPT_URL, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = await res.json();
      if (!Array.isArray(raw)) throw new Error(raw?.error || 'Неверный формат данных');
      writeCache(raw);
      return raw;
    } catch (e) {
      lastError = e;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}
