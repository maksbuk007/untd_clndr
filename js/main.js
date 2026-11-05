import { CACHE_TTL } from './config.js';
import { loadMonth, peek } from './store.js';
import { renderGrid } from './calendar.js';
import { filterGroups, updateFilterButton, renderFilterList, renderNext, renderAgenda } from './panel.js';
import { initDialog, showDialog, openDay } from './modal.js';
import { initTheme } from './theme.js';
import { toKey, groupByDay } from './dates.js';
import { groupOf, capitalize } from './utils.js';

const $ = id => document.getElementById(id);
const monthName = new Intl.DateTimeFormat('ru-RU', { month: 'long' });
const todayFmt = new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
const plural = new Intl.PluralRules('ru');
const WORDS = { one: 'событие', few: 'события', many: 'событий', other: 'события' };
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const idle = window.requestIdleCallback ?? (fn => setTimeout(fn, 800));
const monthStart = d => new Date(d.getFullYear(), d.getMonth(), 1);

// events — сетка месяца, upcoming — ближайшие для боковой панели
const state = { view: monthStart(new Date()), events: [], upcoming: [], hidden: new Set(), loadedAt: 0, ready: false };
let loadToken = 0;

const loaded = () => [...state.events, ...state.upcoming];
const visibleOnly = list => list.filter(e => !state.hidden.has(groupOf(e)));

function renderToday() {
  const base = capitalize(todayFmt.format(new Date()));
  const key = toKey(new Date());
  const n = state.upcoming.filter(e => e.key === key).length;
  $('today-line').textContent = state.ready ? `${base} · ${n ? `сегодня ${n} ${WORDS[plural.select(n)]}` : 'сегодня событий нет'}` : base;
}

function render({ animate = false } = {}) {
  const visible = visibleOnly(state.events);
  const upcoming = visibleOnly(state.upcoming);
  const open = (date, events) => openDay($('modal'), date, events);
  const openEvent = ev => open(ev.date, upcoming.filter(e => e.key === ev.key));
  const rest = upcoming.slice(1, 6);

  $('month').textContent = `${capitalize(monthName.format(state.view))} ${state.view.getFullYear()}`;
  renderToday();
  updateFilterButton($('filter-btn'), $('filter-label'), filterGroups(loaded()), state.hidden);
  renderGrid($('grid'), state.view, groupByDay(visible), open);
  renderNext($('next'), upcoming[0], openEvent);
  renderAgenda($('agenda'), rest, openEvent);
  $('more').hidden = !rest.length;

  if (animate && !reduceMotion) {
    $('grid').animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'ease-out' });
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

// Заранее подгружаем соседние месяцы — листание становится мгновенным
function prefetch() {
  idle(() => [-1, 1].forEach(d => loadMonth(new Date(state.view.getFullYear(), state.view.getMonth() + d, 1)).catch(() => {})));
}

async function load({ force = false } = {}) {
  const token = ++loadToken; // если пользователь уже листает дальше, старый ответ игнорируется
  const grid = $('grid');
  grid.classList.toggle('loading', !state.events.length);
  grid.setAttribute('aria-busy', 'true');
  try {
    const data = await loadMonth(state.view, force);
    if (token !== loadToken) return;
    Object.assign(state, data, { loadedAt: Date.now(), ready: true });
    setStatus('');
    prefetch();
  } catch (err) {
    if (token !== loadToken) return;
    console.error('Не удалось загрузить события:', err);
    setStatus(state.ready ? 'Нет связи — показаны ранее загруженные данные' : 'Не удалось загрузить события. Проверьте интернет и повторите.', { retry: true });
  }
  grid.classList.remove('loading');
  grid.setAttribute('aria-busy', 'false');
  render();
}

/* ---------- События интерфейса ---------- */
function go(view) {
  state.view = view;
  render({ animate: true });
  load();
}
const shift = delta => go(new Date(state.view.getFullYear(), state.view.getMonth() + delta, 1));

function bindEvents() {
  $('prev').addEventListener('click', () => shift(-1));
  $('next-month').addEventListener('click', () => shift(1));
  $('today').addEventListener('click', () => go(monthStart(new Date())));
  $('retry').addEventListener('click', () => load({ force: true }));
  $('filter-btn').addEventListener('click', openFilter);
  $('filter-reset').addEventListener('click', resetFilter);

  addEventListener('keydown', e => {
    if (document.querySelector('dialog[open]') || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'ArrowLeft') shift(-1);
    if (e.key === 'ArrowRight') shift(1);
  });

  // Свайп по календарю на телефоне
  let start = null;
  const cal = document.querySelector('.cal');
  cal.addEventListener('touchstart', e => { start = e.changedTouches[0]; }, { passive: true });
  cal.addEventListener('touchend', e => {
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.clientX, dy = t.clientY - start.clientY;
    start = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 2) shift(dx < 0 ? 1 : -1);
  }, { passive: true });

  // Вернулись на вкладку спустя время — тихо обновляем данные
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && Date.now() - state.loadedAt > CACHE_TTL) load({ force: true });
  });
}

initTheme($('theme'));
initDialog($('modal'));
initDialog($('filter-modal'));
bindEvents();

const warm = peek(state.view); // показываем сохранённый ответ сразу, пока идёт запрос
if (warm) Object.assign(state, warm, { ready: true });
render();
load();
