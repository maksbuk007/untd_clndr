import { api } from './api.js';
import { h, call, fail, avatar } from './ui.js';
import { ME } from './session.js';
import { initTheme } from './theme.js';
import { initDialog } from './modal.js';
import { viewCalendar, viewList } from './admin-events.js';
import { viewUsers, viewCats, viewLogs, viewImport } from './admin-manage.js';

const $ = id => document.getElementById(id);
const ROLES = { pending: 'Ожидает', moderator: 'Модератор', admin: 'Администратор' };
const views = { calendar: viewCalendar, list: viewList, users: viewUsers, cats: viewCats, logs: viewLogs, import: viewImport };
let tab;
let clientId = '';
let loading;
let googleScript;
let loginObserver;

function screen(name) {
  for (const s of ['boot', 'login', 'pending', 'main']) $('screen-' + s).hidden = s !== name;
  $('who').hidden = $('logout').hidden = !ME.user;
}

function show(next) {
  if (next === tab) return;
  tab = next;
  document.querySelectorAll('.tab').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tab === tab)));
  $('pane').replaceChildren(views[tab]());
}

/* ---------- Вход через Google ---------- */
function loadGsi() {
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id);
  if (!googleScript) {
    googleScript = new Promise((resolve, reject) => {
      const script = h('script', { src: 'https://accounts.google.com/gsi/client', async: true });
      script.onload = () => window.google?.accounts?.id ? resolve(window.google.accounts.id) : reject(new Error('Google Identity Services'));
      script.onerror = reject;
      document.head.append(script);
    }).catch(error => { googleScript = null; throw error; });
  }
  return googleScript;
}

async function showLogin() {
  screen('login');
  const error = $('login-error');
  const container = $('gsi');
  const spinner = $('login-spin');
  loginObserver?.disconnect();
  container.replaceChildren();
  spinner.hidden = true;
  error.textContent = '';
  if (!clientId) { error.textContent = 'Вход через Google не настроен. Обратитесь к администратору.'; return; }
  let identity;
  try { identity = await loadGsi(); } catch {
    error.textContent = 'Не удалось загрузить вход Google.';
    container.append(h('button', { type: 'button', class: 'btn', onclick: showLogin }, 'Повторить'));
    return;
  }
  identity.initialize({
    client_id: clientId,
    callback: async r => {
      if (!spinner.hidden) return;
      spinner.hidden = false;
      error.textContent = '';
      try { setUser((await call('/api/session', { method: 'POST', body: { credential: r.credential } })).user); }
      catch (e) { error.textContent = e.message; }
      finally { spinner.hidden = true; }
    },
  });
  let buttonWidth;
  const renderButton = () => {
    const width = Math.min(280, container.clientWidth);
    if (!width || width === buttonWidth) return;
    buttonWidth = width;
    container.replaceChildren();
    identity.renderButton(container, {
      theme: document.documentElement.dataset.theme === 'dark' ? 'filled_black' : 'outline',
      size: 'large', shape: 'pill', text: 'signin_with', locale: 'ru', width,
    });
  };
  renderButton();
  if (window.ResizeObserver) {
    loginObserver = new ResizeObserver(renderButton);
    loginObserver.observe(container);
  }
}

/* ---------- Запуск ---------- */
function boot() {
  if (loading) return loading;
  screen('boot');
  $('boot-spin').hidden = false;
  $('boot-text').textContent = 'Загружаем панель управления…';
  loading = api('/api/session').then(session => {
    clientId = session.clientId;
    setUser(session.user);
  }).catch(() => {
    $('boot-spin').hidden = true;
    $('boot-text').replaceChildren('Не удалось связаться с сервером. ', h('button', { type: 'button', class: 'btn small', onclick: boot }, 'Повторить'));
  }).finally(() => { loading = null; });
  return loading;
}

function setUser(user) {
  ME.user = user;
  if (!user) {
    tab = undefined;
    $('pane').replaceChildren();
    showLogin();
    return;
  }
  loginObserver?.disconnect();

  $('uname').textContent = ME.user.name;
  $('uname').title = ME.user.name;
  $('badge').textContent = ROLES[ME.user.role] ?? ROLES.pending;
  $('avatar').replaceChildren(avatar(ME.user));
  if (ME.user.role !== 'admin' && ME.user.role !== 'moderator') return screen('pending');

  document.querySelectorAll('.admin-only').forEach(b => { b.hidden = ME.user.role !== 'admin'; });
  screen('main');
  show('calendar');
}

$('logout').addEventListener('click', async () => {
  const button = $('logout');
  button.disabled = true;
  try {
    await call('/api/session', { method: 'DELETE' });
    window.google?.accounts?.id.disableAutoSelect();
    setUser(null);
  } catch (e) { fail(e); }
  finally { button.disabled = false; }
});
$('recheck').addEventListener('click', boot);
$('tabs').addEventListener('click', e => {
  const b = e.target.closest('[data-tab]');
  if (b && !b.hidden) show(b.dataset.tab);
});

initTheme($('theme'));
initDialog($('dlg'));
boot();
