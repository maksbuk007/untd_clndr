// Всё управление: события, пользователи, категории, журнал, импорт. Права проверяются здесь, на сервере.
import { randomUUID } from 'node:crypto';
import { getDb, FieldPath, FieldValue, Timestamp } from '../../server/db.js';
import { guard } from '../../server/auth.js';
import { HttpError, bad, send, handleError } from '../../server/http.js';
import { cleanEvent, expand, eventFields, shapeEvent, TIME } from '../../server/events.js';
import { clearCategoryReads, clearEventReads, monthData, readCategories } from '../../server/calendar.js';
import { isCalendarMonth, isRealDate, parseDate, formatTime, toKey } from '../../js/dates.js';
import { CATEGORIES } from '../../js/config.js';

const STAFF = ['moderator', 'admin'];
const ADMIN = ['admin'];
const ROLES = ['pending', 'moderator', 'admin'];
const EVENT_PAGE = 20;
const PALETTE = ['#2563eb', '#059669', '#dc2626', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#65a30d'];

const slug = s => s.toLowerCase().replace(/\//g, ' ').slice(0, 60).trim();
const hash = s => { let h = 5381; for (const c of s) h = ((h << 5) + h + c.charCodeAt(0)) >>> 0; return h; };
const day = s => (typeof s === 'string' && isRealDate(s) ? s : bad('Некорректная дата'));

function documentId(value) {
  if (typeof value !== 'string' || !value.trim() || Buffer.byteLength(value, 'utf8') > 1500
    || value.includes('/') || value === '.' || value === '..' || /^__.*__$/.test(value)) {
    bad('Некорректный идентификатор');
  }
  return value;
}

function log(batch, db, me, action, target, details = '') {
  batch.set(db.collection('logs').doc(), {
    ts: FieldValue.serverTimestamp(), uid: me.id, name: me.name,
    action, target: String(target).slice(0, 200), details: String(details).slice(0, 300),
  });
}
const stamp = me => ({ updatedBy: me.id, updatedByName: me.name, updatedAt: FieldValue.serverTimestamp() });
const retainedColor = (current, category) => (current.category || '') === category ? current.color || '' : '';

/* ---------- События ---------- */
async function events(req, db, me) {
  const col = db.collection('events');
  const b = req.body ?? {};

  if (req.method === 'GET') {
    const past = req.query.past === '1';
    const dir = past ? 'desc' : 'asc';
    let q = col.where('date', past ? '<' : '>=', day(req.query.today))
      .orderBy('date', dir).orderBy(FieldPath.documentId(), dir).select(...eventFields(true));
    if (req.query.afterDate !== undefined || req.query.afterId !== undefined) {
      q = q.startAfter(day(req.query.afterDate), documentId(req.query.afterId));
    }
    const [snap, cats] = await Promise.all([
      q.limit(EVENT_PAGE + 1).get(),
      req.query.includeCategories === '1' ? readCategories() : null,
    ]);
    const docs = snap.docs.slice(0, EVENT_PAGE);
    const last = docs.at(-1);
    const next = snap.docs.length > EVENT_PAGE ? { date: last.get('date'), id: last.id } : null;
    return { items: docs.map(d => shapeEvent(d.id, d.data(), true)), next, ...(cats ? { categories: cats } : {}) };
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
    clearEventReads();
    return { created: list.length };
  }

  const ref = col.doc(documentId(req.query.id));
  const scope = req.query.scope ?? 'one';
  if (scope !== 'one' && scope !== 'following') bad('Некорректная область изменения');
  const data = req.method === 'PUT' ? cleanEvent(b) : null;
  const count = await db.runTransaction(async transaction => {
    const snap = await transaction.get(ref);
    if (!snap.exists) throw new HttpError(404, 'Событие не найдено');
    const cur = snap.data();
    const series = scope === 'following' && cur.seriesId
      ? (await transaction.get(col.where('seriesId', '==', cur.seriesId).select('date', 'endDate', 'category', 'color')))
        .docs.filter(d => d.id !== snap.id && d.get('date') > cur.date)
      : [];
    const affected = series.length + 1;

    if (data) {
      const { title, time, endTime, description, category } = data;
      if (endTime && endTime <= time && series.some(d => !d.get('endDate') || d.get('endDate') === d.get('date'))) {
        bad('Время окончания должно быть позже начала у всех однодневных событий серии');
      }
      transaction.update(ref, { ...data, color: retainedColor(cur, category), ...stamp(me) });
      for (const d of series) {
        transaction.update(d.ref, { title, time, endTime, description, category, color: retainedColor(d.data(), category), ...stamp(me) });
      }
      log(transaction, db, me, 'update', title, affected > 1 ? `${affected} событий серии` : data.date);
    } else {
      transaction.delete(ref);
      series.forEach(d => transaction.delete(d.ref));
      log(transaction, db, me, 'delete', cur.title, affected > 1 ? `${affected} событий серии` : cur.date);
    }
    return affected;
  });
  clearEventReads();
  return { count };
}

/* ---------- Месяц для календаря в панели ---------- */
async function month(req) {
  const m = req.query.month;
  if (typeof m !== 'string' || !isCalendarMonth(m)) bad('Некорректный месяц');
  return monthData(m, undefined, true);
}

/* ---------- Категории ---------- */
const categoryName = label => (typeof label === 'string' ? label.normalize().trim().toLowerCase().replace(/\s+/g, ' ') : '');

async function categories(req, db, me) {
  const col = db.collection('categories');
  if (req.method === 'GET') return { items: await readCategories({ fresh: true }) };
  if (req.method === 'DELETE') {
    const id = documentId(req.query.id);
    const batch = db.batch();
    batch.delete(col.doc(id));
    log(batch, db, me, 'cat-del', id);
    await batch.commit();
    clearCategoryReads();
    return { ok: true };
  }

  const body = req.body ?? {};
  const label = typeof body.label === 'string' ? body.label.trim() : '';
  const { color, previous } = body;
  if (!label) bad('Введите название категории');
  if (label.length > 60) bad('Название категории должно содержать не более 60 символов');
  if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color)) bad('Некорректный цвет');
  if (previous !== undefined && (!previous || typeof previous !== 'object' || Array.isArray(previous))) {
    bad('Некорректные исходные данные категории');
  }
  const editing = req.method === 'PUT';
  const id = documentId(editing ? req.query.id : slug(label));
  const name = categoryName(label);

  const category = await db.runTransaction(async transaction => {
    let ref = col.doc(id);
    let before;
    if (editing) {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) throw new HttpError(404, 'Категория не найдена');
      before = snapshot.data();
      if (previous && (before.label !== previous.label || before.color !== previous.color)) {
        throw new HttpError(409, 'Категория уже изменена. Откройте вкладку заново и повторите попытку.');
      }
      if (before.label === label && before.color === color) return { id, label, color };
    }

    if (!editing || categoryName(before.label) !== name) {
      const existing = await transaction.get(col.select('label'));
      if (existing.docs.some(doc => (!editing || doc.id !== id) && categoryName(doc.get('label')) === name)) {
        throw new HttpError(409, 'Категория с таким названием уже есть');
      }
      // После переименования исходный ID всё ещё принадлежит событиям старой категории.
      if (!editing && existing.docs.some(doc => doc.id === id)) ref = col.doc(randomUUID());
    }

    if (editing) transaction.update(ref, { label, color });
    else transaction.create(ref, { label, color });

    const details = before?.label && before.label !== label ? `${before.label} → ${label} · ${color}` : color;
    log(transaction, db, me, 'cat-save', label, details);
    return { id: ref.id, label, color };
  });
  clearCategoryReads();
  return { ok: true, category };
}

/* ---------- Пользователи ---------- */
async function users(req, db, me) {
  const col = db.collection('users');
  if (req.method === 'GET') {
    const snap = await col.select('name', 'email', 'photo', 'role').get();
    return { items: snap.docs.map(d => ({ id: d.id, ...d.data() })) };
  }
  const id = documentId(req.query.id);
  if (id === me.id) bad('Нельзя менять собственную учётную запись');
  const role = req.body?.role;
  if (req.method === 'PATCH' && !ROLES.includes(role)) bad('Неизвестная роль');
  await db.runTransaction(async transaction => {
    const ref = col.doc(id);
    const snap = await transaction.get(ref);
    if (!snap.exists) throw new HttpError(404, 'Пользователь не найден');
    const u = snap.data();
    const name = u.name || u.email || id;
    if (req.method === 'PATCH') {
      if (role === u.role) return;
      transaction.update(ref, { role });
      log(transaction, db, me, 'role', name, `${u.role} → ${role}`);
    } else {
      transaction.delete(ref);
      log(transaction, db, me, 'user-del', name, u.email);
    }
  });
  return { ok: true };
}

/* ---------- Журнал ---------- */
const LOG_PAGE = 20;

function logCursor(after) {
  if (typeof after === 'string' && after.length <= 4096 && /^[A-Za-z0-9_-]+$/.test(after)) {
    try {
      const cursor = JSON.parse(Buffer.from(after, 'base64url').toString('utf8'));
      if (Array.isArray(cursor) && cursor.length === 3) {
        const [seconds, nanoseconds, id] = cursor;
        const time = seconds === null && nanoseconds === null ? null : new Timestamp(seconds, nanoseconds);
        return [time, documentId(id)];
      }
    } catch { /* Невалидный курсор. */ }
  }
  return bad('Некорректная позиция журнала');
}

async function logs(req, db) {
  let query = db.collection('logs').select('ts', 'name', 'action', 'target', 'details')
    .orderBy('ts', 'desc').orderBy(FieldPath.documentId(), 'desc');
  if (req.query.after !== undefined) query = query.startAfter(...logCursor(req.query.after));

  const { docs } = await query.limit(LOG_PAGE + 1).get();
  const page = docs.slice(0, LOG_PAGE);
  const items = page.map(doc => {
    const log = doc.data();
    return { ...log, ts: log.ts?.toMillis?.() ?? 0 };
  });
  if (docs.length <= LOG_PAGE) return { items, next: null };

  const last = page.at(-1);
  const time = last.get('ts');
  // Полное время и ID различают записи с одинаковой отображаемой датой.
  const next = Buffer.from(JSON.stringify([time?.seconds ?? null, time?.nanoseconds ?? null, last.id])).toString('base64url');
  return { items, next };
}

/* ---------- Импорт из старой Google Таблицы ---------- */
async function importSheet(req, db, me) {
  if (!process.env.SHEET_URL) bad('Не задана переменная SHEET_URL (адрес Apps Script)');
  let raw;
  try {
    const r = await fetch(process.env.SHEET_URL, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new HttpError(502, `Таблица не отвечает (HTTP ${r.status})`);
    raw = await r.json();
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, 'Не удалось получить данные из таблицы');
  }
  if (!Array.isArray(raw)) throw new HttpError(502, 'Таблица вернула неверный формат данных');

  const pick = (x, ...keys) => { for (const k of keys) if (x[k] != null && String(x[k]).trim()) return String(x[k]).trim(); return ''; };
  const rows = new Map();
  let skipped = 0;
  for (const x of raw) {
    try {
      const date = parseDate(x['Дата']);
      if (!date) throw new Error('date');
      const time = formatTime(x['Время']);
      const color = pick(x, 'Цвет').toLowerCase();
      const category = color.startsWith('#') || !color ? '' : documentId(slug(color));
      const data = {
        ...cleanEvent({ title: pick(x, 'Название', 'Название события') || 'Без названия',
          date: toKey(date), time: TIME.test(time) ? time : '', description: pick(x, 'Описание'), category }),
        color: /^#[0-9a-f]{6}$/i.test(color) ? color : '',
      };
      // Keep the identity used by previous imports, so reruns do not create duplicate documents.
      const id = 'imp_' + hash(`${data.date}|${data.time}|${data.title}`).toString(36);
      rows.set(id, data);
    } catch { skipped++; }
  }

  const ops = [];
  const assigned = new Set([...rows.values()].map(r => r.category).filter(Boolean));
  if (assigned.size) {
    const have = new Set((await readCategories({ fresh: true })).map(c => c.id));
    for (const id of assigned) {
      if (have.has(id)) continue;
      const label = id.charAt(0).toUpperCase() + id.slice(1);
      const color = CATEGORIES[id]?.color ?? PALETTE[hash(id) % PALETTE.length];
      ops.push(batch => batch.set(db.collection('categories').doc(id), { label, color }));
    }
  }
  const categoriesCreated = ops.length > 0;
  for (const [id, event] of rows) {
    const ref = db.collection('events').doc(id);
    ops.push(batch => batch.set(ref, { ...event, seriesId: '', createdBy: me.id, createdByName: me.name, createdAt: FieldValue.serverTimestamp(), ...stamp(me) }));
  }
  ops.push(batch => log(batch, db, me, 'import', 'Google Таблица', `${rows.size} событий`));
  try {
    for (let i = 0; i < ops.length; i += 400) {
      const batch = db.batch();
      ops.slice(i, i + 400).forEach(op => op(batch));
      await batch.commit();
    }
  } finally {
    // Earlier batches may already have committed even if a later write fails.
    if (categoriesCreated) clearCategoryReads();
    if (rows.size) clearEventReads();
  }
  return { imported: rows.size, skipped };
}

const routes = {
  events: { roles: STAFF, methods: ['GET', 'POST', 'PUT', 'DELETE'], run: events },
  month: { roles: STAFF, methods: ['GET'], run: month },
  categories: { roles: STAFF, methods: ['GET', 'POST', 'PUT', 'DELETE'], adminWrites: true, run: categories },
  users: { roles: ADMIN, methods: ['GET', 'PATCH', 'DELETE'], run: users },
  logs: { roles: ADMIN, methods: ['GET'], run: logs },
  import: { roles: ADMIN, methods: ['POST'], run: importSheet },
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const routeName = req.query?.res;
    const route = typeof routeName === 'string' && Object.hasOwn(routes, routeName) ? routes[routeName] : null;
    if (!route) throw new HttpError(404, 'Не найдено');
    if (!route.methods.includes(req.method)) {
      res.setHeader('Allow', route.methods.join(', '));
      throw new HttpError(405, 'Метод не поддерживается');
    }
    const roles = route.adminWrites && req.method !== 'GET' ? ADMIN : route.roles;
    const me = await guard(req, roles);
    return send(res, 200, await route.run(req, getDb(), me));
  } catch (e) { return handleError(res, e); }
}
