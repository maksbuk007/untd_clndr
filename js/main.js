import { loadMonth, MONTH_TTL, peek } from './store.js';
import { renderGrid } from './calendar.js';
import { filterGroups, updateFilterButton, renderFilterList, renderNext, renderAgenda } from './panel.js';
import { initDialog, showDialog, openDay } from './modal.js';
import { initTheme } from './theme.js';
import { calendarToday, groupByDay, isCalendarMonth, monthKey, monthStart, toKey } from './dates.js';
import { capitalize, groupOf, setCategories } from './utils.js';

const $ = id => document.getElementById(id);
const monthName = new Intl.DateTimeFormat('ru-RU', { month: 'long' });
const todayFmt = new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
const plural = new Intl.PluralRules('ru');
const WORDS = { one: 'событие', few: 'события', many: 'событий', other: 'события' };
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const today = calendarToday();
const state = {
  today, view: monthStart(today), events: [], upcoming: null, todayCount: null,
  hidden: new Set(), monthReady: false, loadedAt: 0, agendaLoadedAt: 0,
};
let loadToken = 0;

const loaded = () => [...state.events, ...(state.upcoming ?? [])];
const visibleOnly = list => list.filter(e => !state.hidden.has(groupOf(e)));
const onDay = (ev, key) => ev.key <= key && ev.endKey >= key;

function renderToday() {
  const base = capitalize(todayFmt.format(state.today));
  const n = state.todayCount;
  $('today-line').textContent = n === null ? base : `${base} · ${n ? `${n} ${WORDS[plural.select(n)]}` : 'событий нет'}`;
}

function render({ animate = false } = {}) {
  const visible = visibleOnly(state.events);
  const upcoming = visibleOnly(state.upcoming ?? []);
  const open = (date, events) => openDay($('modal'), date, events);
  const todayKey = toKey(state.today);
  const openEvent = ev => {
    const ongoing = ev.key < todayKey;
    const day = ongoing ? todayKey : ev.key;
    const other = new Map([...visible, ...upcoming].filter(e => e.id !== ev.id && onDay(e, day)).map(e => [e.id, e]));
    open(ongoing ? state.today : ev.date, [ev, ...other.values()]);
  };
  const rest = upcoming.slice(1, 6);

  $('month').textContent = `${capitalize(monthName.format(state.view))} ${state.view.getFullYear()}`;
  $('prev').disabled = !canShift(-1);
  $('next-month').disabled = !canShift(1);
  renderToday();
  const groups = filterGroups(loaded());
  updateFilterButton($('filter-btn'), $('filter-label'), groups, state.hidden);
  renderGrid($('grid'), state.view, groupByDay(visible, state.view), open);
  const emptyMessage = state.upcoming?.length ? 'Среди ближайших событий нет выбранных категорий' : 'Ближайших событий нет';
  renderNext($('next'), upcoming[0], openEvent, {
    today: state.today, emptyMessage: state.upcoming === null ? '' : emptyMessage,
  });
  renderAgenda($('agenda'), rest, openEvent);
  $('more').hidden = !rest.length;

  if (animate && !reduceMotion) {
    $('grid').animate?.([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'ease-out' });
  }
}

/* ---------- Фильтр ---------- */
function syncReset() {
  $('filter-reset').disabled = !filterGroups(loaded()).some(g => state.hidden.has(g.key));
}

function buildFilterList() {
  renderFilterList($('filter-list'), filterGroups(loaded()), state.hidden, (key, checked) => {
    checked ? state.hidden.delete(key) : state.hidden.add(key);
    render();
    syncReset();
  });
  syncReset();
}

function openFilter() {
  buildFilterList();
  showDialog($('filter-modal'));
}

function resetFilter() {
  state.hidden.clear();
  buildFilterList();
  render();
}

/* ---------- Загрузка ---------- */
function setStatus(message, { retry = false } = {}) {
  $('status').hidden = !message;
  $('status').firstElementChild.textContent = message ?? '';
  $('retry').hidden = !retry;
}

function apply(data) {
  state.events = data.events;
  state.monthReady = true;
  state.loadedAt = data.fetchedAt;
  if (data.upcoming && data.fetchedAt >= state.agendaLoadedAt) {
    setCategories(data.categories);
    state.agendaLoadedAt = data.fetchedAt;
    state.upcoming = data.upcoming;
    const key = toKey(state.today);
    state.todayCount = data.todayCount ?? data.upcoming.filter(e => onDay(e, key)).length;
  } else if (!state.agendaLoadedAt) {
    setCategories(data.categories);
  }
}

async function load({ force = false } = {}) {
  const token = ++loadToken;
  const day = toKey(state.today);
  const grid = $('grid');
  grid.classList.toggle('loading', !state.monthReady);
  grid.setAttribute('aria-busy', 'true');
  setStatus(state.monthReady ? '' : 'Загружаем расписание…');
  try {
    const data = await loadMonth(state.view, day, { force });
    if (token !== loadToken) return;
    apply(data);
    setStatus('');
  } catch (err) {
    if (token !== loadToken) return;
    console.error('Не удалось загрузить события:', err);
    setStatus(state.monthReady ? 'Не удалось обновить расписание. Показана сохранённая версия.' : 'Не удалось загрузить этот месяц.', { retry: true });
  }
  grid.classList.remove('loading');
  grid.setAttribute('aria-busy', 'false');
  render();
}

/* ---------- События интерфейса ---------- */
function go(view) {
  if (!isCalendarMonth(monthKey(view))) return;
  if (monthKey(view) !== monthKey(state.view)) {
    state.view = view;
    state.events = [];
    state.monthReady = false;
    state.loadedAt = 0;
    const cached = peek(view, toKey(state.today));
    if (cached) apply(cached);
    render({ animate: true });
  }
  load();
}
const shifted = delta => new Date(state.view.getFullYear(), state.view.getMonth() + delta, 1);
const canShift = delta => isCalendarMonth(monthKey(shifted(delta)));
const shift = delta => go(shifted(delta));

function updateDay() {
  const date = calendarToday();
  if (toKey(date) === toKey(state.today)) return false;
  const currentMonth = monthKey(state.view) === monthKey(state.today);
  Object.assign(state, { today: date, upcoming: null, todayCount: null, loadedAt: 0, agendaLoadedAt: 0 });
  if (currentMonth && monthKey(state.view) !== monthKey(date)) go(monthStart(date));
  else { render(); load(); }
  return true;
}

function bindEvents() {
  $('prev').addEventListener('click', () => shift(-1));
  $('next-month').addEventListener('click', () => shift(1));
  $('today').addEventListener('click', () => {
    updateDay();
    go(monthStart(state.today));
  });
  $('retry').addEventListener('click', () => load({ force: true }));
  $('filter-btn').addEventListener('click', openFilter);
  $('filter-reset').addEventListener('click', resetFilter);

  addEventListener('keydown', e => {
    if (document.querySelector('dialog[open]') || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey
      || e.target.closest?.('input, textarea, select, [contenteditable]')) return;
    if (e.key === 'ArrowLeft') shift(-1);
    if (e.key === 'ArrowRight') shift(1);
  });

  // Свайп по календарю на телефоне
  let start = null;
  const cal = document.querySelector('.cal');
  cal.addEventListener('touchstart', e => { start = e.touches.length === 1 ? e.changedTouches[0] : null; }, { passive: true });
  cal.addEventListener('touchcancel', () => { start = null; }, { passive: true });
  cal.addEventListener('touchend', e => {
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.clientX, dy = t.clientY - start.clientY;
    start = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 2) shift(dx < 0 ? 1 : -1);
  }, { passive: true });

  // Вернулись на вкладку спустя время — тихо обновляем данные
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !updateDay() && Date.now() - state.loadedAt >= MONTH_TTL) load();
  });
  setInterval(() => { if (!document.hidden) updateDay(); }, MONTH_TTL);
}

initTheme($('theme'));
initDialog($('modal'));
initDialog($('filter-modal'));
bindEvents();

const warm = peek(state.view, toKey(state.today));
if (warm) apply(warm);
render();
load();
