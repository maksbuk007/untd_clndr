import { api } from './api.js';
import { h, call, fail, avatar, app } from './ui.js';
import { ME } from './session.js';
import { initTheme } from './theme.js';
import { initDialog } from './modal.js';
import { viewCalendar, viewList } from './admin-events.js';
import { viewUsers, viewCats, viewLogs, viewImport } from './admin-manage.js';

const $ = id => document.getElementById(id);
const ROLES = { pending: 'Ожидает', moderator: 'Модератор', admin: 'Администратор' };
const views = { calendar: viewCalendar, list: viewList, users: viewUsers, cats: viewCats, logs: viewLogs, import: viewImport };
let tab = 'calendar';

function screen(name) {
  for (const s of ['boot', 'login', 'pending', 'main']) $('screen-' + s).hidden = s !== name;
  $('who').hidden = $('logout').hidden = !ME.user;
}

function show(next = tab) {
  tab = next;
  document.querySelectorAll('.tab').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  $('pane').replaceChildren(views[tab]());
}
app.reload = () => show();

/* ---------- Вход через Google ---------- */
const loadGsi = () => new Promise((ok, no) => {
  if (window.google?.accounts) return ok();
  const s = h('script', { src: 'https://accounts.google.com/gsi/client', async: true });
  s.onload = ok;
  s.onerror = no;
  document.head.append(s);
});

async function showLogin(clientId) {
  screen('login');
  const error = $('login-error');
  error.textContent = '';
  if (!clientId) { error.textContent = 'На сервере не задан GOOGLE_CLIENT_ID — см. SETUP.md.'; return; }
  try { await loadGsi(); } catch { error.textContent = 'Не удалось загрузить вход Google. Проверьте интернет.'; return; }
  google.accounts.id.initialize({
    client_id: clientId,
    callback: async r => {
      $('login-spin').hidden = false;
      try { await call('/api/session', { method: 'POST', body: { credential: r.credential } }); await boot(); }
      catch (e) { $('login-spin').hidden = true; error.textContent = e.message; }
    },
  });
  google.accounts.id.renderButton($('gsi'), {
    theme: document.documentElement.dataset.theme === 'dark' ? 'filled_black' : 'outline',
    size: 'large', shape: 'pill', text: 'signin_with', locale: 'ru', width: 280,
  });
}

/* ---------- Запуск ---------- */
async function boot() {
  screen('boot');
  let session;
  try { session = await api('/api/session'); }
  catch {
    $('boot-spin').hidden = true;
    $('boot-text').textContent = 'Не удалось связаться с сервером. Обновите страницу.';
    return;
  }
  ME.user = session.user;
  if (!ME.user) return showLogin(session.clientId);

  $('uname').textContent = ME.user.name;
  $('badge').textContent = ROLES[ME.user.role] ?? ROLES.pending;
  $('avatar').replaceChildren(avatar(ME.user));
  if (ME.user.role !== 'admin' && ME.user.role !== 'moderator') return screen('pending');

  document.querySelectorAll('.admin-only').forEach(b => { b.hidden = ME.user.role !== 'admin'; });
  screen('main');
  show('calendar');
}

$('logout').addEventListener('click', async () => {
  try { await call('/api/session', { method: 'DELETE' }); window.google?.accounts?.id.disableAutoSelect(); } catch (e) { fail(e); }
  ME.user = null;
  boot();
});
$('recheck').addEventListener('click', () => location.reload());
$('tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) show(b.dataset.tab); });

initTheme($('theme'));
initDialog($('dlg'));
boot();
