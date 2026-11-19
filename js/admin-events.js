// Календарь для редактирования, список событий и удобная форма создания
import { h, field, call, toast, fail, openDlg, closeDlg, confirmDlg, skeletons } from './ui.js';
import { CATEGORIES, DEFAULT_COLOR } from './config.js';
import { addDays, calendarToday, groupByDay, isCalendarMonth, isRealDate, MAX_REPEATS, monthKey, monthStart, repeatDates, toKey } from './dates.js';
import { capitalize, colorOf, compareEvents, groupLabel, toEvent, whenText, setCategories } from './utils.js';
import { renderGrid } from './calendar.js';

const monthFmt = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' });
const longFmt = new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
const dmy = key => key.split('-').reverse().join('.');
const icon = path => { const s = h('span', { class: 'ico-wrap' }); s.innerHTML = `<svg class="ico" viewBox="0 0 24 24"><path d="${path}"/></svg>`; return s; };
const toggle = (label, input) => h('label', { class: 'toggle' }, input, h('span', { class: 'track' }), h('span', {}, label));
const radio = (value, label, checked) => h('label', { class: 'radio' }, h('input', { type: 'radio', name: 'scope', value, checked }), h('span', {}, label));
const VIEW_TTL = 60_000;

function loadStatus(retry) {
  const text = h('span');
  const root = h('div', { class: 'status', role: 'status', hidden: true }, text,
    h('button', { class: 'btn small', type: 'button', onclick: retry }, 'Повторить'));
  return { root, set(message = '') { text.textContent = message; root.hidden = !message; } };
}

/* ---------- Форма события ---------- */
export function eventForm(ev = {}, onSaved) {
  const editing = Boolean(ev.id);
  const multiDay = Boolean(ev.endKey && ev.endKey !== ev.key);
  const cats = Object.entries(CATEGORIES).map(([id, c]) => [id, c.label, c.color]);
  if (ev.category && !CATEGORIES[ev.category]) cats.push([ev.category, groupLabel(ev.category), colorOf(ev.category)]);
  const category = ev.category ?? cats[0]?.[0] ?? '';
  cats.push(['', 'Без категории', DEFAULT_COLOR]);

  const title = h('input', { class: 'input big', maxlength: 200, autocomplete: 'off', value: ev.title ?? '' });
  const date = h('input', { class: 'input', type: 'date', value: ev.key ?? '' });
  const endDate = h('input', { class: 'input', type: 'date', value: multiDay ? ev.endKey : '' });
  const time = h('input', { class: 'input', type: 'time', value: ev.time ?? '' });
  const endTime = h('input', { class: 'input', type: 'time', value: ev.endTime ?? '' });
  const desc = h('textarea', { class: 'input', rows: 5, maxlength: 5000, placeholder: 'Подробности, ссылки, что взять с собой…' }, ev.description ?? '');
  const counter = h('small', { class: 'muted counter' });
  const allDay = h('input', { type: 'checkbox', checked: !ev.time });
  const multi = h('input', { type: 'checkbox', checked: multiDay });
  const every = h('select', { class: 'input' }, ...[['', 'Не повторять'], ['week', 'Каждую неделю'], ['2weeks', 'Раз в две недели'], ['month', 'Раз в месяц']].map(([v, l]) => h('option', { value: v }, l)));
  const until = h('input', { class: 'input', type: 'date' });
  const repeatInfo = h('small', { class: 'muted' });
  const err = h('p', { class: 'form-error', role: 'alert' });

  const chips = h('div', { class: 'chips', role: 'radiogroup', 'aria-label': 'Категория' },
    cats.map(([id, label, color]) => h('label', { class: 'chip', vars: { '--c': color } },
      h('input', { type: 'radio', name: 'category', value: id, checked: category === id }), h('span', {}, label))));

  const timeRow = h('div', { class: 'two' }, field('Начало', time), field('Конец', endTime));
  const endRow = field('Дата окончания', endDate);
  const untilField = field('Повторять до', until);
  const quick = h('div', { class: 'quick' }, ...[['Сегодня', 0], ['Завтра', 1], ['Через неделю', 7]].map(([label, n]) =>
    h('button', { type: 'button', class: 'chip sm', onclick: () => { date.value = addDays(toKey(calendarToday()), n); sync(); } }, label)));

  const sync = () => {
    timeRow.hidden = allDay.checked;
    endRow.hidden = !multi.checked;
    const hasDate = isRealDate(date.value);
    endDate.min = hasDate ? addDays(date.value, 1) : '';
    until.min = hasDate ? date.value : '';
    counter.textContent = `${desc.value.length}/5000`;
    untilField.hidden = !every.value;
    if (every.value && !until.value && hasDate) until.value = addDays(date.value, 90);
    const n = every.value ? repeatDates(date.value, every.value, until.value).length : 0;
    repeatInfo.textContent = !n ? '' : n > MAX_REPEATS ? `Слишком много повторов (максимум ${MAX_REPEATS})` : `Будет создано событий: ${n}`;
  };
  for (const [node, evt] of [[allDay, 'change'], [multi, 'change'], [every, 'change'], [date, 'input'], [until, 'input'], [desc, 'input']]) node.addEventListener(evt, sync);

  const submit = h('button', { class: 'btn primary', type: 'submit' }, editing ? 'Сохранить' : 'Создать');
  const submitLabel = submit.textContent;
  const scopeBox = editing && ev.seriesId
    ? h('fieldset', { class: 'scope' }, h('legend', {}, 'Это событие входит в серию'), radio('one', 'Изменить только это', true), radio('following', 'Изменить это и следующие, сохранив даты следующих событий', false))
    : null;

  async function save() {
    if (submit.disabled) return;
    err.textContent = '';
    const body = {
      title: title.value.trim(), date: date.value, endDate: multi.checked ? endDate.value : '',
      time: allDay.checked ? '' : time.value, endTime: allDay.checked ? '' : endTime.value,
      description: desc.value.trim(), category: chips.querySelector('input:checked').value,
    };
    if (!body.title) { err.textContent = 'Введите название'; return title.focus(); }
    if (!isRealDate(body.date)) { err.textContent = 'Выберите дату'; return date.focus(); }
    if (multi.checked && (!isRealDate(body.endDate) || body.endDate <= body.date)) {
      err.textContent = 'Выберите дату окончания позже даты начала';
      return endDate.focus();
    }
    if (!allDay.checked && !body.time) { err.textContent = 'Укажите время начала или включите «Весь день»'; return time.focus(); }
    if (body.endTime && !body.endDate && body.endTime <= body.time) {
      err.textContent = 'Время окончания должно быть позже начала';
      return endTime.focus();
    }
    if (!editing && every.value) {
      const count = repeatDates(body.date, every.value, until.value).length;
      if (!count || count > MAX_REPEATS) {
        err.textContent = count ? `Слишком много повторов (максимум ${MAX_REPEATS})` : 'Выберите дату окончания повторов';
        return until.focus();
      }
      body.repeat = { every: every.value, until: until.value };
    }

    submit.disabled = true;
    submit.textContent = 'Сохраняем…';
    try {
      if (editing) {
        const scope = scopeBox?.querySelector('input:checked')?.value ?? 'one';
        await call(`/api/admin/events?id=${encodeURIComponent(ev.id)}&scope=${scope}`, { method: 'PUT', body });
      } else {
        await call('/api/admin/events', { method: 'POST', body });
      }
      if (form.isConnected) closeDlg();
      toast(editing ? 'Изменения сохранены' : 'Событие создано');
      onSaved?.();
    } catch (e) {
      if (e.status === 401) return fail(e);
      err.textContent = e.message;
    } finally {
      submit.disabled = false;
      submit.textContent = submitLabel;
    }
  }

  const form = h('form', { class: 'form', novalidate: true, onsubmit: e => { e.preventDefault(); save(); } },
    field('Название', title),
    chips,
    h('div', { class: 'two' }, field('Дата', date), h('div', { class: 'field' }, h('span', {}, 'Быстрый выбор'), quick)),
    toggle('Несколько дней', multi), endRow,
    toggle('Весь день', allDay), timeRow,
    editing ? null : h('div', { class: 'two' }, field('Повторение', every), untilField),
    repeatInfo,
    scopeBox,
    field('Описание', desc), counter,
    err,
    h('div', { class: 'dlg-actions' }, h('button', { class: 'btn', type: 'button', onclick: closeDlg }, 'Отмена'), submit));
  form.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (!e.repeat && !submit.disabled) form.requestSubmit();
    }
  });

  sync();
  openDlg(editing ? 'Изменить событие' : 'Новое событие', form);
  if (!editing && !title.value && matchMedia('(pointer: fine)').matches) title.focus();
}

/* ---------- Удаление и карточка ---------- */
export async function removeEvent(ev, onDone) {
  const scopeBox = ev.seriesId ? h('fieldset', { class: 'scope' }, radio('one', 'Только это событие', true), radio('following', 'Это и все следующие в серии', false)) : null;
  if (!(await confirmDlg(`Удалить «${ev.title}»?`, 'Удалить', scopeBox))) return;
  const scope = scopeBox?.querySelector('input:checked')?.value ?? 'one';
  try {
    await call(`/api/admin/events?id=${encodeURIComponent(ev.id)}&scope=${scope}`, { method: 'DELETE' });
    toast('Удалено');
    onDone?.();
  } catch (e) { fail(e); }
}

const copyOf = ev => ({ ...ev, id: undefined, seriesId: '' });

function eventCard(ev, onChange) {
  return h('article', { class: 'ev', vars: { '--c': colorOf(ev.color || ev.category) } },
    h('div', { class: 'ev-time' }, whenText(ev), ev.seriesId && ' · повторяется'),
    h('h3', { class: 'ev-title' }, ev.title),
    ev.description && h('p', { class: 'ev-desc' }, ev.description),
    h('div', { class: 'ev-actions' },
      h('button', { class: 'btn small', onclick: () => eventForm(ev, onChange) }, 'Изменить'),
      h('button', { class: 'btn small', onclick: () => eventForm(copyOf(ev), onChange) }, 'Копия'),
      h('button', { class: 'btn small danger', onclick: () => removeEvent(ev, onChange) }, 'Удалить')));
}

function daySheet(date, events, onChange) {
  openDlg(capitalize(longFmt.format(date)),
    ...events.map(ev => eventCard(ev, onChange)),
    h('div', { class: 'dlg-actions' }, h('button', { class: 'btn primary', onclick: () => eventForm({ key: toKey(date) }, onChange) }, '+ Добавить на этот день')));
}

/* ---------- Календарь ---------- */
export function viewCalendar() {
  let view = monthStart(calendarToday());
  const cache = new Map();
  const pending = new Map();
  let token = 0;
  const grid = h('div', { class: 'grid loading' });
  const title = h('h2', { 'aria-live': 'polite' });
  const status = loadStatus(() => refresh());

  const draw = entry => {
    title.textContent = capitalize(monthFmt.format(view)).replace(' г.', '');
    if (entry) setCategories(entry.categories);
    renderGrid(grid, view, groupByDay(entry?.events ?? [], view), onDay, { all: Boolean(entry) });
  };
  const onDay = (date, list) => list.length ? daySheet(date, list, afterMutation) : eventForm({ key: toKey(date) }, afterMutation);

  async function refresh() {
    const t = ++token;
    const key = monthKey(view);
    const cached = cache.get(key);
    status.set();
    draw(cached);
    if (cached && Date.now() - cached.fetchedAt < VIEW_TTL) {
      grid.classList.remove('loading');
      grid.setAttribute('aria-busy', 'false');
      return;
    }
    grid.classList.toggle('loading', !cached);
    grid.setAttribute('aria-busy', 'true');
    let request = pending.get(key);
    if (!request) {
      request = call(`/api/admin/month?month=${key}`).finally(() => {
        if (pending.get(key) === request) pending.delete(key);
      });
      pending.set(key, request);
    }
    try {
      const data = await request;
      if (t !== token || !grid.isConnected) return;
      const entry = { events: data.events.map(toEvent).filter(Boolean).sort(compareEvents), categories: data.categories ?? [], fetchedAt: Date.now() };
      cache.set(key, entry);
      if (cache.size > 8) cache.delete(cache.keys().next().value);
      draw(entry);
    } catch (e) {
      if (t !== token || !grid.isConnected) return;
      if (e.status === 401) return fail(e);
      status.set(cached ? 'Не удалось обновить месяц. Показана сохранённая версия.' : 'Не удалось загрузить месяц.');
    } finally {
      if (t === token) {
        grid.classList.remove('loading');
        grid.setAttribute('aria-busy', 'false');
      }
    }
  }
  function afterMutation() {
    pending.clear();
    cache.clear();
    if (grid.isConnected) refresh();
  }
  const arrow = (label, path, fn) => { const b = h('button', { class: 'btn icon', 'aria-label': label, onclick: fn }); b.append(icon(path)); return b; };
  const shifted = n => new Date(view.getFullYear(), view.getMonth() + n, 1);
  const go = v => {
    if (!isCalendarMonth(monthKey(v))) return;
    view = v;
    prev.disabled = !isCalendarMonth(monthKey(shifted(-1)));
    next.disabled = !isCalendarMonth(monthKey(shifted(1)));
    refresh();
  };
  const prev = arrow('Предыдущий месяц', 'm15 18-6-6 6-6', () => go(shifted(-1)));
  const next = arrow('Следующий месяц', 'm9 18 6-6-6-6', () => go(shifted(1)));
  go(view);
  return h('div', {},
    h('div', { class: 'cal-head' }, title,
      h('div', { class: 'cal-nav' },
        h('button', { class: 'btn', onclick: () => go(monthStart(calendarToday())) }, 'Сегодня'),
        prev, next,
        h('button', { class: 'btn primary', onclick: () => eventForm({ key: toKey(calendarToday()) }, afterMutation) }, '+ Событие'))),
    h('p', { class: 'hint' }, 'Выберите день, чтобы посмотреть или добавить событие.'),
    status.root,
    h('div', { class: 'weekdays' }, ...['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(d => h('div', {}, d))),
    grid);
}

/* ---------- Список ---------- */
export function viewList() {
  const pages = new Map();
  let past = false;
  let current;
  let token = 0;
  let busy = false;
  let failedAppend = false;
  let categoriesReady = false;
  const rows = h('div', { class: 'rows' });
  const more = h('button', { class: 'btn', hidden: true, onclick: () => page(true) }, 'Показать ещё');
  const status = loadStatus(() => page(failedAppend));
  const note = h('p', { class: 'hint', hidden: true }, 'Поиск и фильтр действуют на загруженные события. Можно показать ещё.');
  const modes = [[false, 'С сегодняшнего дня'], [true, 'Начались раньше']].map(([mode, label]) =>
    h('button', { class: 'seg-btn', 'aria-pressed': String(mode === past), onclick: () => {
      if (past === mode) return;
      past = mode;
      modes.forEach((button, index) => button.setAttribute('aria-pressed', String(Boolean(index) === past)));
      page(false, { reuse: true });
    } }, label));
  const search = h('input', { class: 'input', type: 'search', placeholder: 'Поиск по названию…', 'aria-label': 'Поиск по названию', oninput: draw });
  const select = h('select', { class: 'input', 'aria-label': 'Категория', onchange: draw });

  function drawCategories() {
    const chosen = select.value;
    const known = new Set([...Object.keys(CATEGORIES), ...current.items.map(e => e.category).filter(Boolean), ...(chosen ? [chosen] : [])]);
    select.replaceChildren(h('option', { value: '' }, 'Все категории'), ...[...known].map(id => h('option', { value: id }, groupLabel(id))));
    select.value = chosen;
  }

  async function page(append, { reuse = false } = {}) {
    if (append && (busy || !current?.next)) return;
    const today = toKey(calendarToday());
    const key = `${today}:${past}`;
    if (append && current.key !== key) return page(false);
    const t = ++token;
    const cached = reuse ? pages.get(key) : null;
    failedAppend = false;
    status.set();
    if (!append) current = cached;
    busy = false;
    if (cached && Date.now() - cached.fetchedAt < VIEW_TTL) {
      drawCategories();
      draw();
      return;
    }

    const p = new URLSearchParams({ past: past ? '1' : '0', today });
    if (!categoriesReady) p.set('includeCategories', '1');
    if (append) { p.set('afterDate', current.next.date); p.set('afterId', current.next.id); }
    busy = true;
    draw();
    try {
      const r = await call('/api/admin/events?' + p);
      if (t !== token || !rows.isConnected) return;
      if (Array.isArray(r.categories)) {
        setCategories(r.categories);
        categoriesReady = true;
      }
      const items = r.items.map(toEvent).filter(Boolean);
      const combined = new Map((append ? [...current.items, ...items] : items).map(ev => [ev.id, ev]));
      current = { key, items: [...combined.values()], next: r.next, fetchedAt: append ? current.fetchedAt : Date.now() };
      pages.set(key, current);
      if (pages.size > 4) pages.delete(pages.keys().next().value);
      drawCategories();
    } catch (e) {
      if (t !== token || !rows.isConnected) return;
      if (e.status === 401) return fail(e);
      failedAppend = append;
      status.set(append ? 'Не удалось загрузить следующую страницу.'
        : cached ? 'Не удалось обновить список. Показана сохранённая версия.' : 'Не удалось загрузить события.');
    } finally {
      if (t === token && rows.isConnected) {
        busy = false;
        draw();
      }
    }
  }

  function draw() {
    const q = search.value.trim().toLowerCase();
    const cat = select.value;
    rows.setAttribute('aria-busy', String(busy));
    more.hidden = !current?.next;
    more.disabled = busy;
    note.hidden = !(current?.next && (q || cat));
    if (!current) {
      rows.replaceChildren(...(busy ? skeletons() : []));
      return;
    }
    const items = current.items.filter(e => (!q || e.title.toLowerCase().includes(q)) && (!cat || e.category === cat));
    const empty = current.next && (q || cat) ? 'Среди загруженных событий совпадений нет' : 'Событий не найдено';
    rows.replaceChildren(...(items.length ? items.map(row) : [h('p', { class: 'empty' }, empty)]));
  }

  function afterMutation() {
    pages.clear();
    if (rows.isConnected) page(false);
  }
  const row = ev => h('div', { class: 'row' },
    h('div', { class: 'row-date' }, dmy(ev.key), h('small', {}, ev.endKey !== ev.key ? `до ${dmy(ev.endKey)}` : ev.time ? whenText(ev) : 'весь день')),
    h('div', { class: 'row-main' },
      h('strong', {}, ev.title),
      h('span', { class: 'tag', vars: { '--c': colorOf(ev.color || ev.category) } }, ev.category ? groupLabel(ev.category) : 'Другое', ev.seriesId && ' · повтор'),
      h('small', { class: 'muted' }, `Изменил: ${ev.updatedByName || '—'}`)),
    h('div', { class: 'row-actions' },
      h('button', { class: 'btn small', onclick: () => eventForm(ev, afterMutation) }, 'Изменить'),
      h('button', { class: 'btn small', onclick: () => eventForm(copyOf(ev), afterMutation) }, 'Копия'),
      h('button', { class: 'btn small danger', onclick: () => removeEvent(ev, afterMutation) }, 'Удалить')));

  select.append(h('option', { value: '' }, 'Все категории'), ...Object.entries(CATEGORIES).map(([id, c]) => h('option', { value: id }, c.label)));
  page(false);
  return h('div', {},
    h('div', { class: 'toolbar' }, h('div', { class: 'seg', role: 'group', 'aria-label': 'Дата начала' }, modes), search, select,
      h('button', { class: 'btn primary', onclick: () => eventForm({ key: toKey(calendarToday()) }, afterMutation) }, '+ Событие')),
    status.root, note,
    rows, h('div', { class: 'more' }, more));
}
