import { CACHE_TTL } from './config.js';
import { fetchEvents, readCache, normalize } from './api.js';
import { renderGrid } from './calendar.js';
import { filterGroups, updateFilterButton, renderFilterList, renderAgenda } from './panel.js';
import { initDialog, showDialog, openDay } from './modal.js';
import { initTheme } from './theme.js';
import { groupOf, capitalize } from './utils.js';

const $ = id => document.getElementById(id);
const monthName = new Intl.DateTimeFormat('ru-RU', { month: 'long' });
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const monthStart = d => new Date(d.getFullYear(), d.getMonth(), 1);

const state = { view: monthStart(new Date()), events: [], hidden: new Set(), loadedAt: 0 };

function groupByDay(events) {
  const map = new Map();
  for (const e of events) {
    if (!map.has(e.key)) map.set(e.key, []);
    map.get(e.key).push(e);
  }
  return map;
}

function render({ animate = false } = {}) {
  const visible = state.events.filter(e => !state.hidden.has(groupOf(e)));
  const open = (date, events) => openDay($('modal'), date, events);

  $('month').textContent = `${capitalize(monthName.format(state.view))} ${state.view.getFullYear()}`;
  updateFilterButton($('filter-btn'), $('filter-label'), filterGroups(state.events), state.hidden);
  renderGrid($('grid'), state.view, groupByDay(visible), open);
  renderAgenda($('agenda'), visible, ev => open(ev.date, visible.filter(e => e.key === ev.key)));

  if (animate && !reduceMotion) {
    $('grid').animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'ease-out' });
  }
}

/* ---------- Фильтр ---------- */
function syncReset() {
  $('filter-reset').disabled = !filterGroups(state.events).some(g => state.hidden.has(g.key));
}

function buildFilterList() {
  renderFilterList($('filter-list'), filterGroups(state.events), state.hidden, (key, checked) => {
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

async function load() {
  const grid = $('grid');
  grid.classList.toggle('loading', !state.events.length);
  grid.setAttribute('aria-busy', 'true');
  try {
    state.events = normalize(await fetchEvents());
    state.loadedAt = Date.now();
    setStatus('');
  } catch (err) {
    console.error('Не удалось загрузить события:', err);
    setStatus(state.events.length ? 'Нет связи — показаны сохранённые данные' : 'Не удалось загрузить события. Проверьте интернет и повторите.', { retry: true });
  } finally {
    grid.classList.remove('loading');
    grid.setAttribute('aria-busy', 'false');
    render();
  }
}

/* ---------- События интерфейса ---------- */
function shift(delta) {
  state.view = new Date(state.view.getFullYear(), state.view.getMonth() + delta, 1);
  render({ animate: true });
}

function bindEvents() {
  $('prev').addEventListener('click', () => shift(-1));
  $('next').addEventListener('click', () => shift(1));
  $('today').addEventListener('click', () => { state.view = monthStart(new Date()); render({ animate: true }); });
  $('retry').addEventListener('click', load);
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
    if (!document.hidden && Date.now() - state.loadedAt > CACHE_TTL) load();
  });
}

initTheme($('theme'));
initDialog($('modal'));
initDialog($('filter-modal'));
bindEvents();

// Мгновенно показываем сохранённые данные, затем обновляем с сервера
const cached = readCache();
if (cached) state.events = normalize(cached.raw);
render();
load();
