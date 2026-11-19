// Пользователи, категории, журнал, импорт (только для администратора)
import { h, call, toast, fail, confirmDlg, lazy, avatar, field, openDlg, closeDlg } from './ui.js';
import { ME } from './session.js';
import { colorOf, setCategories } from './utils.js';

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
  let busy = false;
  const add = h('button', { class: 'btn primary', type: 'button', onclick: () => edit() }, 'Новая категория');
  const note = h('p', { class: 'note' }, 'Пока используются стандартные категории. Здесь можно добавить свои.');
  const rows = h('div', { class: 'rows' });

  function setBusy(active) {
    busy = active;
    add.disabled = active;
    rows.querySelectorAll('button').forEach(button => { button.disabled = active; });
  }

  function edit(category) {
    if (busy) return;
    const colorValue = /^#[0-9a-f]{6}$/i.test(category?.color) ? category.color : '#2563eb';
    const name = h('input', { class: 'input', name: 'label', value: category?.label || '', maxlength: 60, required: true });
    const color = h('input', { class: 'color', type: 'color', name: 'color', value: colorValue });
    const error = h('p', { class: 'form-error', role: 'alert' });
    const action = category ? 'Сохранить' : 'Добавить';
    const submit = h('button', { class: 'btn primary', type: 'submit' }, action);
    const form = h('form', { class: 'form category-form', onsubmit: save },
      h('div', { class: 'category-fields' }, field('Название', name), field('Цвет', color)), error,
      h('div', { class: 'dlg-actions' }, h('button', { class: 'btn', type: 'button', onclick: closeDlg }, 'Отмена'), submit));

    async function save(event) {
      event.preventDefault();
      if (busy) return;
      const label = name.value.trim();
      if (!label) { name.value = ''; return name.reportValidity(); }
      if (label === category?.label && color.value === category.color?.toLowerCase()) return closeDlg();

      error.textContent = '';
      submit.textContent = 'Сохраняем…';
      submit.disabled = true;
      setBusy(true);
      let saved;
      try {
        const body = { label, color: color.value };
        const query = category ? `?${new URLSearchParams({ id: category.id })}` : '';
        if (category) body.previous = { label: category.label, color: category.color };
        saved = (await call(`/api/admin/categories${query}`, { method: category ? 'PUT' : 'POST', body })).category;
        if (!saved?.id) throw new Error('Сервер не вернул обновлённую категорию.');
      } catch (e) {
        if (e.status === 401) return fail(e);
        error.textContent = e.message;
        return;
      } finally {
        setBusy(false);
        submit.disabled = false;
        submit.textContent = action;
      }
      const dialogOpen = form.closest('dialog')?.open;
      if (dialogOpen) closeDlg();
      cats.set(saved.id, saved);
      setCategories([...cats.values()]);
      draw();
      if (dialogOpen && category) rows.querySelector(`button[data-category-edit="${CSS.escape(saved.id)}"]`)?.focus({ preventScroll: true });
      toast(category ? 'Изменения сохранены' : 'Категория добавлена');
    }

    openDlg(category ? 'Изменить категорию' : 'Новая категория', form);
  }

  async function remove(category, label) {
    if (busy || !await confirmDlg(`Удалить категорию «${label}»? События сохранятся.`)) return;
    setBusy(true);
    try {
      await call(`/api/admin/categories?${new URLSearchParams({ id: category.id })}`, { method: 'DELETE' });
      cats.delete(category.id);
      setCategories([...cats.values()]);
      draw();
      toast('Категория удалена');
    } catch (e) { fail(e); }
    finally { setBusy(false); }
  }

  function row(category) {
    const { id } = category;
    const label = category.label || 'Без названия';
    const swatch = h('span', { class: 'category-swatch', 'aria-hidden': 'true', vars: { '--c': colorOf(category.color || id.toLowerCase()) } });
    const modify = h('button', { class: 'btn small', type: 'button', 'data-category-edit': id, disabled: busy, onclick: () => edit(category) }, 'Изменить');
    const del = h('button', { class: 'btn small danger', type: 'button', disabled: busy, onclick: () => remove(category, label) }, 'Удалить');
    return h('div', { class: 'row cat' }, swatch, h('div', { class: 'row-main' }, h('strong', {}, label)), h('div', { class: 'row-actions' }, modify, del));
  }

  function draw() {
    note.hidden = cats.size > 0;
    rows.replaceChildren(...[...cats.values()].sort((a, b) => (a.label || '').localeCompare(b.label || '', 'ru')).map(row));
  }

  draw();
  return h('div', {}, h('div', { class: 'toolbar cat-toolbar' }, add), note, rows);
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
