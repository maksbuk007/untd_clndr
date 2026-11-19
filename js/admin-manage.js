// Пользователи, категории, журнал, импорт (только для администратора)
import { h, call, toast, fail, confirmDlg, lazy, avatar } from './ui.js';
import { ME } from './session.js';

const ROLES = { pending: 'Ожидает', moderator: 'Модератор', admin: 'Администратор' };
const ACTIONS = { create: 'Создал событие', update: 'Изменил событие', delete: 'Удалил событие', role: 'Сменил роль', 'user-del': 'Удалил пользователя', 'cat-save': 'Сохранил категорию', 'cat-del': 'Удалил категорию', import: 'Импортировал данные' };

export const viewUsers = () => lazy(async () => {
  const rank = u => ({ pending: 0, admin: 1, moderator: 2 })[u.role] ?? 3;
  const users = new Map((await call('/api/admin/users')).items.map(u => [u.id, u]));
  const pending = new Set();
  const notice = h('p', { class: 'note' });
  const rows = h('div', { class: 'rows' });

  async function change(user, role, controls) {
    if (pending.has(user.id)) return;
    pending.add(user.id);
    controls.forEach(control => { control.disabled = true; });
    try {
      await call(`/api/admin/users?id=${encodeURIComponent(user.id)}`, role
        ? { method: 'PATCH', body: { role } } : { method: 'DELETE' });
      if (role) user.role = role;
      else users.delete(user.id);
      toast(role ? 'Роль изменена' : 'Пользователь удалён');
    } catch (e) { fail(e); }
    finally { pending.delete(user.id); draw(); }
  }

  function row(user) {
    const self = user.id === ME.user?.id;
    const disabled = self || pending.has(user.id);
    const name = user.name || user.email || 'Без имени';
    const roles = h('select', { class: 'input', disabled, 'aria-label': `Роль: ${name}`, onchange: () => change(user, roles.value, [roles, remove]) },
      ...Object.entries(ROLES).map(([value, label]) => h('option', { value, selected: user.role === value }, label)));
    const remove = h('button', { class: 'btn small danger', disabled, onclick: async () => {
      if (await confirmDlg(`Удалить пользователя ${name}? Он потеряет доступ.`)) change(user, null, [roles, remove]);
    } }, 'Удалить');
    return h('div', { class: 'row user' }, avatar(user),
      h('div', { class: 'row-main' }, h('strong', {}, name, self && h('span', { class: 'muted' }, ' (вы)')), h('small', { class: 'muted' }, user.email)),
      h('div', { class: 'row-actions' }, roles, remove));
  }

  function draw() {
    const sorted = [...users.values()].sort((a, b) => rank(a) - rank(b) || (a.name || '').localeCompare(b.name || '', 'ru'));
    const waiting = sorted.filter(u => u.role === 'pending').length;
    notice.hidden = !waiting;
    notice.textContent = `Ожидают подтверждения: ${waiting}. Для доступа назначьте роль.`;
    rows.replaceChildren(...sorted.map(row));
  }

  draw();
  return h('div', {}, notice, rows);
});

export const viewCats = () => lazy(async () => {
  const cats = new Map((await call('/api/admin/categories')).items.map(c => [c.id, c]));
  const pending = new Set();
  const name = h('input', { class: 'input', placeholder: 'Название категории', 'aria-label': 'Название категории', maxlength: 60, required: true });
  const color = h('input', { class: 'color', type: 'color', value: '#2563eb', 'aria-label': 'Цвет' });
  const add = h('button', { class: 'btn primary', type: 'submit' }, 'Добавить');
  const note = h('p', { class: 'note' }, 'Пока используются стандартные категории. Здесь можно добавить свои.');
  const rows = h('div', { class: 'rows' });

  async function create(event) {
    event.preventDefault();
    if (add.disabled) return;
    const label = name.value.trim();
    if (!label) { name.value = ''; return name.reportValidity(); }
    add.disabled = true;
    try {
      const response = await call('/api/admin/categories', { method: 'POST', body: { label, color: color.value } });
      cats.set(response.category.id, response.category);
      if (name.value.trim() === label) name.value = '';
      toast('Категория добавлена');
      draw();
    } catch (e) { fail(e); }
    finally { add.disabled = false; }
  }

  async function change(category, newColor, controls) {
    if (pending.has(category.id)) return;
    pending.add(category.id);
    controls.forEach(control => { control.disabled = true; });
    try {
      await call(`/api/admin/categories?id=${encodeURIComponent(category.id)}`, newColor
        ? { method: 'PUT', body: { label: category.label, color: newColor } } : { method: 'DELETE' });
      if (newColor) category.color = newColor;
      else { cats.delete(category.id); toast('Категория удалена'); }
    } catch (e) { fail(e); }
    finally { pending.delete(category.id); draw(); }
  }

  function row(category) {
    const disabled = pending.has(category.id);
    const swatch = h('input', { class: 'color', type: 'color', value: category.color, disabled, 'aria-label': `Цвет: ${category.label}`,
      onchange: () => change(category, swatch.value, [swatch, remove]) });
    const remove = h('button', { class: 'btn small danger', disabled, onclick: async () => {
      if (await confirmDlg(`Удалить категорию «${category.label}»? События сохранятся.`)) change(category, null, [swatch, remove]);
    } }, 'Удалить');
    return h('div', { class: 'row cat' }, swatch, h('div', { class: 'row-main' }, h('strong', {}, category.label)), remove);
  }

  function draw() {
    note.hidden = cats.size > 0;
    rows.replaceChildren(...[...cats.values()].sort((a, b) => (a.label || '').localeCompare(b.label || '', 'ru')).map(row));
  }

  draw();
  return h('div', {}, h('form', { class: 'toolbar', onsubmit: create }, name, color, add), note, rows);
});

export const viewLogs = () => lazy(async () => {
  const first = await call('/api/admin/logs');
  if (!first.items.length) return h('p', { class: 'empty' }, 'Записей пока нет');

  const fmt = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
  const row = l => h('div', { class: 'row log' },
    h('div', { class: 'row-date' }, l.ts ? fmt.format(l.ts) : '—'),
    h('div', { class: 'row-main' },
      h('span', {}, h('strong', {}, l.name), ` — ${ACTIONS[l.action] ?? l.action}`),
      h('span', {}, l.target, l.details && h('span', { class: 'muted' }, ` · ${l.details}`))));
  const rows = h('div', { class: 'rows' }, first.items.map(row));
  const error = h('p', { class: 'form-error', role: 'alert' });
  let next = first.next;
  let loading = false;
  const more = h('button', { class: 'btn', type: 'button', onclick: loadMore }, 'Показать ещё');
  const controls = h('div', { class: 'more', hidden: !next }, more);

  async function loadMore() {
    if (loading || !next) return;
    loading = true;
    error.textContent = '';
    more.textContent = 'Загружаем…';
    more.setAttribute('aria-disabled', 'true');
    rows.setAttribute('aria-busy', 'true');
    try {
      const page = await call(`/api/admin/logs?${new URLSearchParams({ after: next })}`);
      if (!rows.isConnected) return;
      const added = page.items.map(row);
      rows.append(...added);
      next = page.next;
      if (added.length && document.activeElement === more) {
        added[0].tabIndex = -1;
        added[0].focus();
      }
      controls.hidden = !next;
      more.textContent = 'Показать ещё';
    } catch (e) {
      if (!rows.isConnected) return;
      if (e.status === 401) return fail(e);
      error.textContent = 'Не удалось загрузить следующие записи.';
      more.textContent = 'Повторить';
    } finally {
      loading = false;
      more.removeAttribute('aria-disabled');
      rows.setAttribute('aria-busy', 'false');
    }
  }

  return h('div', {}, rows, error, controls);
});

export function viewImport() {
  const out = h('p', { class: 'muted' });
  const btn = h('button', { class: 'btn primary', onclick: async () => {
    btn.disabled = true;
    out.textContent = 'Импортируем…';
    try {
      const r = await call('/api/admin/import', { method: 'POST', body: {} });
      out.textContent = `Готово: добавлено или обновлено — ${r.imported}${r.skipped ? `, пропущено строк с ошибками — ${r.skipped}` : ''}.`;
      toast('Импорт завершён');
    } catch (e) { fail(e); out.textContent = 'Не удалось выполнить импорт.'; }
    btn.disabled = false;
  } }, 'Импортировать из Google Таблицы');
  return h('div', { class: 'notice left' },
    h('h2', {}, 'Перенос старых данных'),
    h('p', { class: 'muted' }, 'Берёт события из Google Таблицы (адрес задан переменной SHEET_URL) и добавляет их вместе с категориями. Повторный запуск дублей не создаёт.'),
    btn, out);
}
