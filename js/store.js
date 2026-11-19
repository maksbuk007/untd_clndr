import { api } from './api.js';
import { monthKey } from './dates.js';
import { compareEvents, toEvent } from './utils.js';

export const MONTH_TTL = 60_000;
const MAX_AGE = 7 * 24 * 60 * 60_000;
const MAX_MONTHS = 8;
const STORAGE_KEY = 'calendar-months-v1';
const pending = new Map();

function readMonths() {
  try { return new Map(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')); }
  catch { return new Map(); }
}

const months = readMonths();
const list = arr => arr.map(toEvent).filter(Boolean).sort(compareEvents);

function snapshot(entry, day) {
  if (!entry || Date.now() - entry.fetchedAt > MAX_AGE) return null;
  const { raw, fetchedAt } = entry;
  if (!Array.isArray(raw?.events) || !Array.isArray(raw.upcoming)) return null;
  const sameDay = day === entry.day;
  return {
    categories: Array.isArray(raw.categories) ? raw.categories : [],
    events: list(raw.events),
    upcoming: sameDay ? list(raw.upcoming) : null,
    todayCount: sameDay && Number.isInteger(raw.todayCount) ? raw.todayCount : null,
    fetchedAt: sameDay ? fetchedAt : 0,
  };
}

export function peek(view, day) {
  return snapshot(months.get(monthKey(view)), day);
}

export async function loadMonth(view, day, { force = false } = {}) {
  const key = monthKey(view);
  const requestKey = `${key}:${day}`;
  if (pending.has(requestKey)) return pending.get(requestKey);
  const cached = months.get(key);
  if (!force && day === cached?.day && Date.now() - cached.fetchedAt < MONTH_TTL) {
    const hit = snapshot(cached, day);
    if (hit) return hit;
  }

  const query = new URLSearchParams({ month: key, t: day });
  const request = api(`/api/calendar?${query}`, { cache: force ? 'reload' : 'default' }).then(raw => {
    const entry = { day, raw, fetchedAt: Date.now() };
    const data = snapshot(entry, day);
    if (!data) throw new Error('Некорректный ответ календаря');
    if (!months.has(key) || months.get(key).day <= day) {
      months.delete(key);
      months.set(key, entry);
      while (months.size > MAX_MONTHS) months.delete(months.keys().next().value);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...months])); } catch { /* кэш в памяти остаётся доступным */ }
    }
    return data;
  }).finally(() => pending.delete(requestKey));
  pending.set(requestKey, request);
  return request;
}
