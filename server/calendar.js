import { FieldPath, getDb } from './db.js';
import { gridBounds, toKey, addDays } from '../js/dates.js';
import { MAX_SPAN_DAYS, eventFields, shapeEvent } from './events.js';

const UPCOMING_LIMIT = 20;
const READ_TTL = 30_000;
const CACHE_LIMIT = 20;
const CATEGORY_KEY = 'categories';
const reads = new Map();
let endDateIndexed = true;

function cachedRead(key, read, fresh = false) {
  const hit = reads.get(key);
  if (hit && (hit.expiresAt === Infinity || (!fresh && hit.expiresAt > Date.now()))) return hit.result;

  const entry = { expiresAt: Infinity };
  entry.result = Promise.resolve().then(read).then(result => {
    entry.expiresAt = Date.now() + READ_TTL;
    return result;
  }, error => {
    if (reads.get(key) === entry) reads.delete(key);
    throw error;
  });
  reads.delete(key);
  reads.set(key, entry);
  if (reads.size > CACHE_LIMIT) reads.delete(reads.keys().next().value);
  return entry.result;
}

export function clearEventReads() {
  for (const key of reads.keys()) {
    if (key !== CATEGORY_KEY) reads.delete(key);
  }
}

export function clearCategoryReads() {
  reads.delete(CATEGORY_KEY);
}

export function readCategories({ fresh = false } = {}) {
  return cachedRead(CATEGORY_KEY, async () => {
    const snap = await getDb().collection('categories').select('label', 'color').get();
    return snap.docs.map(doc => ({ id: doc.id, label: doc.get('label'), color: doc.get('color') }));
  }, fresh);
}

function eventsQuery(staff) {
  return getDb().collection('events').select(...eventFields(staff));
}

const eventsFrom = (docs, staff) => docs.map(doc => shapeEvent(doc.id, doc.data(), staff));
const byStart = (a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.id.localeCompare(b.id);

async function spanning(from, staff) {
  const query = eventsQuery(staff);
  if (endDateIndexed) {
    try {
      // With a maximum duration of 60 days, earlier starts crossing this date end within this window.
      const snap = await query.where('endDate', '>=', from).where('endDate', '<', addDays(from, MAX_SPAN_DAYS)).get();
      return eventsFrom(snap.docs, staff).filter(event => event.date < from);
    } catch (error) {
      // Firestore indexes this field by default, but existing projects may have disabled it.
      if (error.code !== 9 || !/index/i.test(error.message)) throw error;
      endDateIndexed = false;
    }
  }
  const snap = await query.where('date', '>=', addDays(from, -MAX_SPAN_DAYS)).where('date', '<', from).get();
  return eventsFrom(snap.docs, staff).filter(event => event.endDate >= from);
}

async function readWindow(from, to, staff) {
  const [starts, overlaps] = await Promise.all([
    eventsQuery(staff).where('date', '>=', from).where('date', '<=', to).get(),
    spanning(from, staff),
  ]);
  return [...overlaps, ...eventsFrom(starts.docs, staff)];
}

async function nextStarts(from, limit) {
  const query = eventsQuery(false);
  const snap = await query.where('date', '>=', from).orderBy('date').limit(limit + 1).get();
  const last = snap.docs[limit - 1];
  const extra = snap.docs[limit];
  if (!extra || last.get('date') !== extra.get('date')) return eventsFrom(snap.docs.slice(0, limit), false);

  // Firestore's date index breaks ties by ID. Complete that day before sorting by time.
  const rest = await query.where('date', '==', extra.get('date')).orderBy(FieldPath.documentId()).startAfter(extra.id).get();
  return eventsFrom([...snap.docs, ...rest.docs], false);
}

async function readUpcoming(today, window) {
  let upcoming;
  if (window) {
    const nearby = (await window.events).filter(event => event.date >= today || event.endDate >= today);
    const remaining = UPCOMING_LIMIT - nearby.length;
    const later = remaining > 0 ? await nextStarts(addDays(window.to, 1), remaining) : [];
    upcoming = [...nearby, ...later];
  } else {
    const ongoing = await spanning(today, false);
    // Even if ongoing events fill the list, get every start today to calculate the total.
    const starts = await nextStarts(today, Math.max(1, UPCOMING_LIMIT - ongoing.length));
    upcoming = [...ongoing, ...starts];
  }
  return {
    todayCount: upcoming.filter(event => event.date <= today).length,
    upcoming: upcoming.sort(byStart).slice(0, UPCOMING_LIMIT),
  };
}

export async function monthData(month, today, staff = false) {
  const [year, monthNumber] = month.split('-').map(Number);
  const { start, count } = gridBounds(new Date(year, monthNumber - 1, 1));
  const from = toKey(start);
  const to = addDays(from, count - 1);
  const load = () => readWindow(from, to, staff);
  const events = staff ? load() : cachedRead(`window:${from}:${to}`, load);
  const agenda = staff ? { upcoming: [] } : cachedRead(`upcoming:${today}`, () => {
    const coversToday = from <= today && today <= to;
    return readUpcoming(today, coversToday ? { events, to } : null);
  });
  const [range, categories, list] = await Promise.all([events, readCategories(), agenda]);
  return { categories, events: range, ...list };
}
