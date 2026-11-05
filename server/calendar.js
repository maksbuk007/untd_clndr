import { getDb } from './db.js';
import { gridBounds, toKey, addDays } from '../js/dates.js';
import { MAX_SPAN_DAYS, shapeEvent } from './events.js';

// Всё, что нужно для одного месяца, за один заход: категории, события сетки и ближайшие
export async function monthData(month, today, staff = false) {
  const [y, m] = month.split('-').map(Number);
  const { start, count } = gridBounds(new Date(y, m - 1, 1));
  const from = toKey(start);
  const to = toKey(new Date(start.getFullYear(), start.getMonth(), start.getDate() + count - 1));
  const db = getDb();

  const [range, up, cats] = await Promise.all([
    db.collection('events').where('date', '>=', addDays(from, -MAX_SPAN_DAYS)).where('date', '<=', to).get(),
    db.collection('events').where('date', '>=', today).orderBy('date').limit(20).get(),
    db.collection('categories').get(),
  ]);
  return {
    categories: cats.docs.map(d => ({ id: d.id, ...d.data() })),
    events: range.docs.map(d => shapeEvent(d.id, d.data(), staff)).filter(e => (e.endDate || e.date) >= from),
    upcoming: up.docs.map(d => shapeEvent(d.id, d.data(), staff)),
  };
}
