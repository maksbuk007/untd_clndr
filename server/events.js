import { isRealDate, addDays, daysBetween, repeatDates, MAX_REPEATS } from '../js/dates.js';
import { bad } from './http.js';

export const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
export const MAX_SPAN_DAYS = 60;

// Проверка и очистка данных события. Любые ошибки — понятным текстом.
export function cleanEvent(b) {
  const title = String(b.title ?? '').trim();
  const date = String(b.date ?? '');
  let endDate = String(b.endDate ?? '');
  const time = String(b.time ?? '');
  const endTime = time ? String(b.endTime ?? '') : '';
  const description = String(b.description ?? '').trim();
  const category = String(b.category ?? '').trim().toLowerCase();

  if (!title || title.length > 200) bad('Название: от 1 до 200 символов');
  if (!isRealDate(date)) bad('Укажите корректную дату');
  if (endDate === date) endDate = '';
  if (endDate) {
    if (!isRealDate(endDate) || endDate < date) bad('Дата окончания не может быть раньше начала');
    if (daysBetween(date, endDate) > MAX_SPAN_DAYS) bad(`Событие не может длиться дольше ${MAX_SPAN_DAYS} дней`);
  }
  if (time && !TIME.test(time)) bad('Некорректное время начала');
  if (endTime && !TIME.test(endTime)) bad('Некорректное время окончания');
  if (endTime && !endDate && endTime <= time) bad('Время окончания должно быть позже начала');
  if (description.length > 5000) bad('Описание: не более 5000 символов');
  if (category.length > 60) bad('Слишком длинное название категории');
  return { title, date, endDate, time, endTime, description, category };
}

// Повторяющиеся события → список отдельных событий
export function expand(data, repeat) {
  if (!repeat?.every) return [data];
  if (!['week', '2weeks', 'month'].includes(repeat.every)) bad('Неизвестный тип повтора');
  const dates = repeatDates(data.date, repeat.every, String(repeat.until ?? ''));
  if (!dates.length) bad('Укажите дату окончания повтора');
  if (dates.length > MAX_REPEATS) bad(`Слишком много повторов (максимум ${MAX_REPEATS})`);
  const span = data.endDate ? daysBetween(data.date, data.endDate) : 0;
  return dates.map(date => ({ ...data, date, endDate: span ? addDays(date, span) : '' }));
}

// Что отдаётся наружу. Для публики — только безопасные поля.
export function shapeEvent(id, d, staff = false) {
  const e = {
    id, title: d.title, date: d.date, endDate: d.endDate || '', time: d.time || '', endTime: d.endTime || '',
    description: d.description || '', category: d.category || '', color: d.color || '',
  };
  if (staff) { e.seriesId = d.seriesId || ''; e.updatedByName = d.updatedByName || ''; }
  return e;
}
