// Пользователи, категории, журнал, импорт (только для администратора)
import { h, call, toast, fail, confirmDlg, lazy, avatar, app } from './ui.js';
import { ME } from './session.js';

const ROLES = { pending: 'Ожидает', moderator: 'Модератор', admin: 'Администратор' };
const ACTIONS = { create: 'Создал событие', update: 'Изменил событие', delete: 'Удалил событие', role: 'Сменил роль', 'user-del': 'Удалил пользователя', 'cat-save': 'Сохранил категорию', 'cat-del': 'Удалил категорию', import: 'Импортировал данные' };

const run = async (fn, okMessage) => {
  try { await fn(); if (okMessage) toast(okMessage); } catch (e) { fail(e); }
  app.reload();
};

export const viewUsers = () => lazy(async () => {
  const rank = u => ({ pending: 0, admin: 1, moderator: 2 })[u.role] ?? 3;
  const users = (await call('/api/admin/users')).items.sort((a, b) => rank(a) - rank(b) || (a.name || '').localeCompare(b.name || '', 'ru'));
  const waiting = users.filter(u => u.role === 'pending').length;

  return h('div', {},
    waiting ? h('p', { class: 'note' }, `Ожидают подтверждения: ${waiting}. Назначьте им роль «Модератор».`) : null,
    h('div', { class: 'rows' }, users.map(u => {
      const self = u.id === ME.user.id;
      return h('div', { class: 'row user' },
        avatar(u),
        h('div', { class: 'row-main' }, h('strong', {}, u.name || 'Без имени', self && h('span', { class: 'muted' }, ' (вы)')), h('small', { class: 'muted' }, u.email)),
        h('div', { class: 'row-actions' },
          h('select', { class: 'input', disabled: self, 'aria-label': 'Роль', onchange: e => run(() => call(`/api/admin/users?id=${u.id}`, { method: 'PATCH', body: { role: e.target.value } }), 'Роль изменена') },
            ...Object.entries(ROLES).map(([v, label]) => h('option', { value: v, selected: u.role === v }, label))),
          h('button', { class: 'btn small danger', disabled: self, onclick: async () => {
            if (await confirmDlg(`Удалить пользователя ${u.name}? Он потеряет доступ.`)) run(() => call(`/api/admin/users?id=${u.id}`, { method: 'DELETE' }), 'Пользователь удалён');
          } }, 'Удалить')));
    })));
});

export const viewCats = () => lazy(async () => {
  const cats = (await call('/api/admin/categories')).items.sort((a, b) => a.label.localeCompare(b.label, 'ru'));
  const name = h('input', { class: 'input', placeholder: 'Название категории', maxlength: 60, required: true });
  const color = h('input', { class: 'color', type: 'color', value: '#2563eb', 'aria-label': 'Цвет' });

  return h('div', {},
    h('form', { class: 'toolbar', onsubmit: e => { e.preventDefault(); run(() => call('/api/admin/categories', { method: 'POST', body: { label: name.value, color: color.value } }), 'Категория добавлена'); } },
      name, color, h('button', { class: 'btn primary', type: 'submit' }, 'Добавить')),
    cats.length ? null : h('p', { class: 'note' }, 'Своих категорий пока нет — используются стандартные. Добавьте первую, и список станет вашим (или сделайте импорт: он создаст категории сам).'),
    h('div', { class: 'rows' }, cats.map(c => h('div', { class: 'row cat' },
      h('input', { class: 'color', type: 'color', value: c.color, 'aria-label': `Цвет: ${c.label}`, onchange: e => run(() => call(`/api/admin/categories?id=${encodeURIComponent(c.id)}`, { method: 'PUT', body: { label: c.label, color: e.target.value } })) }),
      h('div', { class: 'row-main' }, h('strong', {}, c.label)),
      h('button', { class: 'btn small danger', onclick: async () => {
        if (await confirmDlg(`Удалить категорию «${c.label}»? События с ней останутся, но потеряют цвет.`)) run(() => call(`/api/admin/categories?id=${encodeURIComponent(c.id)}`, { method: 'DELETE' }), 'Категория удалена');
      } }, 'Удалить')))));
});

export const viewLogs = () => lazy(async () => {
  const logs = (await call('/api/admin/logs')).items;
  const fmt = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
  return h('div', { class: 'rows' }, logs.length ? logs.map(l => h('div', { class: 'row log' },
    h('div', { class: 'row-date' }, l.ts ? fmt.format(l.ts) : '—'),
    h('div', { class: 'row-main' },
      h('span', {}, h('strong', {}, l.name), ` — ${ACTIONS[l.action] ?? l.action}`),
      h('span', {}, l.target, l.details && h('span', { class: 'muted' }, ` · ${l.details}`))))) : [h('p', { class: 'empty' }, 'Записей пока нет')]);
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
