// Всё управление: события, пользователи, категории, журнал, импорт. Права проверяются здесь, на сервере.
import { FieldPath } from '@google-cloud/firestore';
import { getDb, FieldValue } from '../../server/db.js';
import { guard } from '../../server/auth.js';
import { HttpError, bad, send, handleError } from '../../server/http.js';
import { cleanEvent, expand, shapeEvent, TIME } from '../../server/events.js';
import { monthData } from '../../server/calendar.js';
import { isRealDate, parseDate, formatTime, toKey } from '../../js/dates.js';
import { CATEGORIES } from '../../js/config.js';

const STAFF = ['moderator', 'admin'];
const ROLES = ['pending', 'moderator', 'admin'];
const PAGE = 40;
const PALETTE = ['#2563eb', '#059669', '#dc2626', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#65a30d'];

const slug = s => String(s).trim().toLowerCase().replace(/\//g, ' ').slice(0, 60);
const hash = s => { let h = 5381; for (const c of s) h = ((h << 5) + h + c.charCodeAt(0)) >>> 0; return h; };
const day = s => (isRealDate(String(s)) ? String(s) : bad('Некорректная дата'));

function log(batch, db, me, action, target, details = '') {
  batch.set(db.collection('logs').doc(), {
    ts: FieldValue.serverTimestamp(), uid: me.id, name: me.name,
    action, target: String(target).slice(0, 200), details: String(details).slice(0, 300),
  });
}
const stamp = me => ({ updatedBy: me.id, updatedByName: me.name, updatedAt: FieldValue.serverTimestamp() });
const notAllowed = () => { throw new HttpError(405, 'Метод не поддерживается'); };

/* ---------- События ---------- */
async function events(req, db, me) {
  const col = db.collection('events');
  const { id, scope = 'one' } = req.query;
  const b = req.body ?? {};

  if (req.method === 'GET') {
    const past = req.query.past === '1';
    const dir = past ? 'desc' : 'asc';
    let q = col.where('date', past ? '<' : '>=', day(req.query.today)).orderBy('date', dir).orderBy(FieldPath.documentId(), dir);
    if (req.query.afterDate) q = q.startAfter(day(req.query.afterDate), String(req.query.afterId ?? ''));
    const docs = (await q.limit(PAGE).get()).docs;
    const last = docs.at(-1)?.data();
    return { items: docs.map(d => shapeEvent(d.id, d.data(), true)), next: docs.length === PAGE ? { date: last.date, id: docs.at(-1).id } : null };
  }

  if (req.method === 'POST') {
    const data = cleanEvent(b);
    const list = expand(data, b.repeat);
    const seriesId = list.length > 1 ? col.doc().id : '';
    const batch = db.batch();
    for (const e of list) {
      batch.set(col.doc(), { ...e, color: '', seriesId, createdBy: me.id, createdByName: me.name, createdAt: FieldValue.serverTimestamp(), ...stamp(me) });
    }
    log(batch, db, me, 'create', data.title, list.length > 1 ? `${list.length} повторов, с ${data.date}` : data.date);
    await batch.commit();
    return { created: list.length };
  }

  if (req.method === 'PUT' || req.method === 'DELETE') {
    const ref = col.doc(String(id));
    const snap = await ref.get();
    if (!snap.exists) throw new HttpError(404, 'Событие не найдено');
    const cur = snap.data();
    const batch = db.batch();
    let count = 1;
    const series = scope === 'following' && cur.seriesId
      ? (await col.where('seriesId', '==', cur.seriesId).get()).docs.filter(d => d.id !== snap.id && d.data().date > cur.date)
      : [];

    if (req.method === 'PUT') {
      const data = cleanEvent(b);
      batch.update(ref, { ...data, color: '', ...stamp(me) });
      for (const d of series) {
        batch.update(d.ref, { title: data.title, time: data.time, endTime: data.endTime, description: data.description, category: data.category, ...stamp(me) });
      }
      count += series.length;
      log(batch, db, me, 'update', data.title, count > 1 ? `${count} событий серии` : data.date);
    } else {
      batch.delete(ref);
      series.forEach(d => batch.delete(d.ref));
      count += series.length;
      log(batch, db, me, 'delete', cur.title, count > 1 ? `${count} событий серии` : cur.date);
    }
    await batch.commit();
    return { count };
  }
  return notAllowed();
}

/* ---------- Месяц для календаря в панели (без кэша, всегда свежее) ---------- */
async function month(req) {
  const m = String(req.query.month ?? '');
  if (!/^20[2-9]\d-(0[1-9]|1[0-2])$/.test(m)) bad('Некорректный месяц');
  return monthData(m, day(req.query.today), true);
}

/* ---------- Категории ---------- */
async function categories(req, db, me) {
  const col = db.collection('categories');
  if (req.method === 'GET') return { items: (await col.get()).docs.map(d => ({ id: d.id, ...d.data() })) };
  if (me.role !== 'admin') throw new HttpError(403, 'Недостаточно прав');

  const b = req.body ?? {};
  const batch = db.batch();
  if (req.method === 'POST' || req.method === 'PUT') {
    const label = String(b.label ?? '').trim().slice(0, 60);
    const color = String(b.color ?? '');
    if (!label) bad('Введите название категории');
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) bad('Некорректный цвет');
    batch.set(col.doc(req.method === 'PUT' ? slug(req.query.id) : slug(label)), { label, color });
    log(batch, db, me, 'cat-save', label, color);
  } else if (req.method === 'DELETE') {
    batch.delete(col.doc(slug(req.query.id)));
    log(batch, db, me, 'cat-del', req.query.id);
  } else return notAllowed();
  await batch.commit();
  return { ok: true };
}

/* ---------- Пользователи ---------- */
async function users(req, db, me) {
  const col = db.collection('users');
  if (req.method === 'GET') return { items: (await col.get()).docs.map(d => ({ id: d.id, ...d.data(), createdAt: undefined })) };

  const id = String(req.query.id ?? '');
  if (id === me.id) bad('Нельзя менять собственную учётную запись');
  const snap = await col.doc(id).get();
  if (!snap.exists) throw new HttpError(404, 'Пользователь не найден');
  const u = snap.data();
  const batch = db.batch();

  if (req.method === 'PATCH') {
    const role = String(req.body?.role ?? '');
    if (!ROLES.includes(role)) bad('Неизвестная роль');
    batch.update(snap.ref, { role });
    log(batch, db, me, 'role', u.name, `${u.role} → ${role}`);
  } else if (req.method === 'DELETE') {
    batch.delete(snap.ref);
    log(batch, db, me, 'user-del', u.name, u.email);
  } else return notAllowed();
  await batch.commit();
  return { ok: true };
}

/* ---------- Журнал ---------- */
async function logs() {
  const snap = await getDb().collection('logs').orderBy('ts', 'desc').limit(100).get();
  return { items: snap.docs.map(d => { const x = d.data(); return { ...x, ts: x.ts?.toMillis() ?? 0, uid: undefined }; }) };
}

/* ---------- Импорт из старой Google Таблицы ---------- */
async function importSheet(req, db, me) {
  if (req.method !== 'POST') return notAllowed();
  if (!process.env.SHEET_URL) bad('Не задана переменная SHEET_URL (адрес Apps Script)');
  const r = await fetch(process.env.SHEET_URL, { redirect: 'follow' });
  if (!r.ok) bad(`Таблица не отвечает (HTTP ${r.status})`);
  const raw = await r.json();
  if (!Array.isArray(raw)) bad('Таблица вернула неверный формат данных');

  const pick = (x, ...keys) => { for (const k of keys) if (x[k] != null && String(x[k]).trim()) return String(x[k]).trim(); return ''; };
  const rows = [];
  let skipped = 0;
  for (const x of raw) {
    try {
      const date = parseDate(x['Дата']);
      if (!date) throw new Error('date');
      const time = formatTime(x['Время']);
      const color = pick(x, 'Цвет').toLowerCase();
      rows.push({
        ...cleanEvent({ title: pick(x, 'Название', 'Название события') || 'Без названия', date: toKey(date), time: TIME.test(time) ? time : '', description: pick(x, 'Описание'), category: color.startsWith('#') ? '' : slug(color) }),
        color: /^#[0-9a-f]{6}$/i.test(color) ? color : '',
      });
    } catch { skipped++; }
  }

  const have = new Set((await db.collection('categories').get()).docs.map(d => d.id));
  const ops = [];
  for (const w of new Set(rows.map(r => r.category).filter(Boolean))) {
    if (!have.has(w)) ops.push(b => b.set(db.collection('categories').doc(w), { label: w.charAt(0).toUpperCase() + w.slice(1), color: CATEGORIES[w]?.color ?? PALETTE[hash(w) % PALETTE.length] }));
  }
  for (const e of rows) {
    // Одинаковые строки получают одинаковый id — повторный импорт не создаёт дублей
    const ref = db.collection('events').doc('imp_' + hash(`${e.date}|${e.time}|${e.title}`).toString(36));
    ops.push(b => b.set(ref, { ...e, seriesId: '', createdBy: me.id, createdByName: me.name, createdAt: FieldValue.serverTimestamp(), ...stamp(me) }));
  }
  for (let i = 0; i < ops.length; i += 400) {
    const batch = db.batch();
    ops.slice(i, i + 400).forEach(op => op(batch));
    await batch.commit();
  }
  const batch = db.batch();
  log(batch, db, me, 'import', 'Google Таблица', `${rows.length} событий`);
  await batch.commit();
  return { imported: rows.length, skipped };
}

const routes = {
  events: { roles: STAFF, run: events },
  month: { roles: STAFF, run: month },
  categories: { roles: STAFF, run: categories },
  users: { roles: ['admin'], run: users },
  logs: { roles: ['admin'], run: logs },
  import: { roles: ['admin'], run: importSheet },
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const route = Object.hasOwn(routes, req.query.res) ? routes[req.query.res] : null;
    if (!route) throw new HttpError(404, 'Не найдено');
    const me = await guard(req, route.roles);
    return send(res, 200, await route.run(req, getDb(), me));
  } catch (e) { return handleError(res, e); }
}
