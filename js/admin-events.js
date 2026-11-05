// Календарь для редактирования, список событий и удобная форма создания
import { h, field, call, toast, fail, openDlg, closeDlg, confirmDlg, skeletons } from './ui.js';
import { CATEGORIES } from './config.js';
import { pad, toKey, groupByDay, repeatDates, addDays, MAX_REPEATS } from './dates.js';
import { colorOf, groupLabel, toEvent, whenText, capitalize, setCategories } from './utils.js';
import { renderGrid } from './calendar.js';

const monthFmt = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' });
const longFmt = new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
const monthStart = d => new Date(d.getFullYear(), d.getMonth(), 1);
const dmy = key => key.split('-').reverse().join('.');
const icon = path => { const s = h('span', { class: 'ico-wrap' }); s.innerHTML = `<svg class="ico" viewBox="0 0 24 24"><path d="${path}"/></svg>`; return s; };
const toggle = (label, input) => h('label', { class: 'toggle' }, input, h('span', { class: 'track' }), h('span', {}, label));
const radio = (value, label, checked) => h('label', { class: 'radio' }, h('input', { type: 'radio', name: 'scope', value, checked }), h('span', {}, label));

/* ---------- Форма события ---------- */
export function eventForm(ev = {}, onSaved) {
  const editing = Boolean(ev.id);
  const multiDay = Boolean(ev.endKey && ev.endKey !== ev.key);
  const cats = Object.entries(CATEGORIES).map(([id, c]) => [id, c.label, c.color]);
  if (ev.category && !CATEGORIES[ev.category]) cats.push([ev.category, groupLabel(ev.category), colorOf(ev.category)]);
  let category = ev.category || cats[0]?.[0] || '';

  const title = h('input', { class: 'input big', maxlength: 200, placeholder: 'Название события', autocomplete: 'off', value: ev.title ?? '' });
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

  const chips = h('div', { class: 'chips', role: 'radiogroup', 'aria-label': 'Категория' });
  const drawChips = () => chips.replaceChildren(...cats.map(([id, label, color]) =>
    h('button', { type: 'button', class: 'chip', role: 'radio', 'aria-checked': String(category === id), vars: { '--c': color }, onclick: () => { category = id; drawChips(); } }, label)));

  const timeRow = h('div', { class: 'two' }, field('Начало', time), field('Конец', endTime));
  const endRow = field('Дата окончания', endDate);
  const untilField = field('Повторять до', until);
  const quick = h('div', { class: 'quick' }, ...[['Сегодня', 0], ['Завтра', 1], ['Через неделю', 7]].map(([label, n]) =>
    h('button', { type: 'button', class: 'chip sm', onclick: () => { date.value = addDays(toKey(new Date()), n); sync(); } }, label)));

  const sync = () => {
    timeRow.hidden = allDay.checked;
    endRow.hidden = !multi.checked;
    counter.textContent = `${desc.value.length}/5000`;
    untilField.hidden = !every.value;
    if (every.value && !until.value && date.value) until.value = addDays(date.value, 90);
    const n = every.value ? repeatDates(date.value, every.value, until.value).length : 0;
    repeatInfo.textContent = !n ? '' : n > MAX_REPEATS ? `Слишком много повторов (максимум ${MAX_REPEATS})` : `Будет создано событий: ${n}`;
  };
  for (const [node, evt] of [[allDay, 'change'], [multi, 'change'], [every, 'change'], [date, 'input'], [until, 'input'], [desc, 'input']]) node.addEventListener(evt, sync);

  const submit = h('button', { class: 'btn primary', type: 'submit' }, editing ? 'Сохранить' : 'Создать');
  const scopeBox = editing && ev.seriesId
    ? h('fieldset', { class: 'scope' }, h('legend', {}, 'Это событие входит в серию'), radio('one', 'Изменить только это', true), radio('following', 'Изменить это и все следующие (дата останется прежней)', false))
    : null;

  async function save() {
    err.textContent = '';
    const body = {
      title: title.value.trim(), date: date.value, endDate: multi.checked ? endDate.value : '',
      time: allDay.checked ? '' : time.value, endTime: allDay.checked ? '' : endTime.value,
      description: desc.value.trim(), category,
    };
    if (!body.title) { err.textContent = 'Введите название'; return title.focus(); }
    if (!body.date) { err.textContent = 'Выберите дату'; return date.focus(); }
    if (!allDay.checked && !body.time) { err.textContent = 'Укажите время начала или включите «Весь день»'; return time.focus(); }
    if (!editing && every.value) body.repeat = { every: every.value, until: until.value };

    submit.disabled = true;
    try {
      if (editing) {
        const scope = scopeBox?.querySelector('input:checked')?.value ?? 'one';
        await call(`/api/admin/events?id=${ev.id}&scope=${scope}`, { method: 'PUT', body });
      } else {
        await call('/api/admin/events', { method: 'POST', body });
      }
      closeDlg();
      toast(editing ? 'Изменения сохранены' : 'Событие создано');
      onSaved?.();
    } catch (e) {
      if (e.status === 401) return fail(e);
      err.textContent = e.message;
      submit.disabled = false;
    }
  }

  const form = h('form', { class: 'form', novalidate: true, onsubmit: e => { e.preventDefault(); save(); } },
    title,
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
  form.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') form.requestSubmit(); });

  drawChips();
  sync();
  openDlg(editing ? 'Изменить событие' : 'Новое событие', form);
  if (!editing && !title.value) title.focus();
}

/* ---------- Удаление и карточка ---------- */
export async function removeEvent(ev, onDone) {
  const scopeBox = ev.seriesId ? h('fieldset', { class: 'scope' }, radio('one', 'Только это событие', true), radio('following', 'Это и все следующие в серии', false)) : null;
  if (!(await confirmDlg(`Удалить «${ev.title}»?`, 'Удалить', scopeBox))) return;
  const scope = scopeBox?.querySelector('input:checked')?.value ?? 'one';
  try {
    await call(`/api/admin/events?id=${ev.id}&scope=${scope}`, { method: 'DELETE' });
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
  let view = monthStart(new Date());
  let events = [];
  let token = 0;
  const grid = h('div', { class: 'grid loading' });
  const title = h('h2', {});

  const draw = () => {
    title.textContent = capitalize(monthFmt.format(view)).replace(' г.', '');
    renderGrid(grid, view, groupByDay(events), onDay, { all: true });
  };
  // Пустой день — сразу форма создания; день с событиями — список
  const onDay = (date, list) => (list.length ? daySheet(date, list, refresh) : eventForm({ key: toKey(date) }, refresh));

  async function refresh() {
    const t = ++token;
    try {
      const d = await call(`/api/admin/month?month=${view.getFullYear()}-${pad(view.getMonth() + 1)}&today=${toKey(new Date())}`);
      if (t !== token) return;
      setCategories(d.categories);
      events = d.events.map(toEvent).filter(Boolean);
    } catch (e) { fail(e); }
    grid.classList.remove('loading');
    draw();
  }
  const go = v => { view = v; draw(); refresh(); };
  const shift = n => go(new Date(view.getFullYear(), view.getMonth() + n, 1));

  draw();
  refresh();
  const arrow = (label, path, fn) => { const b = h('button', { class: 'btn icon', 'aria-label': label, onclick: fn }); b.append(icon(path)); return b; };
  return h('div', {},
    h('div', { class: 'cal-head' }, title,
      h('div', { class: 'cal-nav' },
        h('button', { class: 'btn', onclick: () => go(monthStart(new Date())) }, 'Сегодня'),
        arrow('Предыдущий месяц', 'm15 18-6-6 6-6', () => shift(-1)),
        arrow('Следующий месяц', 'm9 18 6-6-6-6', () => shift(1)),
        h('button', { class: 'btn primary', onclick: () => eventForm({ key: toKey(new Date()) }, refresh) }, '+ Событие'))),
    h('p', { class: 'hint' }, 'Нажмите на любой день, чтобы добавить событие. Дни с событиями открывают список с правкой.'),
    h('div', { class: 'weekdays' }, ...['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(d => h('div', {}, d))),
    grid);
}

/* ---------- Список ---------- */
export function viewList() {
  const st = { past: false, items: [], next: null, q: '', cat: '' };
  const rows = h('div', { class: 'rows' }, skeletons());
  const more = h('button', { class: 'btn', hidden: true, onclick: () => page(true) }, 'Показать ещё');
  const seg = h('div', { class: 'seg' });
  const drawSeg = () => seg.replaceChildren(...[[false, 'Предстоящие'], [true, 'Прошедшие']].map(([past, label]) =>
    h('button', { class: 'seg-btn', 'aria-pressed': String(st.past === past), onclick: () => { st.past = past; drawSeg(); page(false); } }, label)));

  async function page(append) {
    if (!append) rows.replaceChildren(...skeletons());
    try {
      const p = new URLSearchParams({ past: st.past ? '1' : '0', today: toKey(new Date()) });
      if (append && st.next) { p.set('afterDate', st.next.date); p.set('afterId', st.next.id); }
      const r = await call('/api/admin/events?' + p);
      const items = r.items.map(toEvent).filter(Boolean);
      st.items = append ? st.items.concat(items) : items;
      st.next = r.next;
      draw();
    } catch (e) { fail(e); rows.replaceChildren(h('p', { class: 'empty' }, 'Не удалось загрузить события')); }
  }

  function draw() {
    const items = st.items.filter(e => (!st.q || e.title.toLowerCase().includes(st.q)) && (!st.cat || e.category === st.cat));
    rows.replaceChildren(...(items.length ? items.map(row) : [h('p', { class: 'empty' }, 'Событий не найдено')]));
    more.hidden = !st.next;
  }

  const row = ev => h('div', { class: 'row' },
    h('div', { class: 'row-date' }, dmy(ev.key), h('small', {}, ev.endKey !== ev.key ? `до ${dmy(ev.endKey)}` : ev.time ? whenText(ev) : 'весь день')),
    h('div', { class: 'row-main' },
      h('strong', {}, ev.title),
      h('span', { class: 'tag', vars: { '--c': colorOf(ev.color || ev.category) } }, ev.category ? groupLabel(ev.category) : 'Другое', ev.seriesId && ' · повтор'),
      h('small', { class: 'muted' }, `Изменил: ${ev.updatedByName || '—'}`)),
    h('div', { class: 'row-actions' },
      h('button', { class: 'btn small', onclick: () => eventForm(ev, () => page(false)) }, 'Изменить'),
      h('button', { class: 'btn small', onclick: () => eventForm(copyOf(ev), () => page(false)) }, 'Копия'),
      h('button', { class: 'btn small danger', onclick: () => removeEvent(ev, () => page(false)) }, 'Удалить')));

  drawSeg();
  page(false);
  return h('div', {},
    h('div', { class: 'toolbar' }, seg,
      h('input', { class: 'input', type: 'search', placeholder: 'Поиск по названию…', 'aria-label': 'Поиск', oninput: e => { st.q = e.target.value.trim().toLowerCase(); draw(); } }),
      h('select', { class: 'input', 'aria-label': 'Категория', onchange: e => { st.cat = e.target.value; draw(); } },
        h('option', { value: '' }, 'Все категории'), ...Object.entries(CATEGORIES).map(([id, c]) => h('option', { value: id }, c.label))),
      h('button', { class: 'btn primary', onclick: () => eventForm({ key: toKey(new Date()) }, () => page(false)) }, '+ Событие')),
    rows, h('div', { class: 'more' }, more));
}
