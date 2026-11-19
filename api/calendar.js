// Публичный эндпоинт. Ответ кэшируется на CDN Vercel, поэтому база читается редко, а сайт отвечает мгновенно.
import { monthData } from '../server/calendar.js';
import { fail, handleError } from '../server/http.js';
import { calendarToday, isCalendarMonth, isRealDate, daysBetween, toKey } from '../js/dates.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return fail(res, 405, 'Метод не поддерживается');
  }
  const month = req.query?.month;
  const today = toKey(calendarToday());
  const requestedDay = req.query?.t;
  if (typeof month !== 'string' || !isCalendarMonth(month) || typeof requestedDay !== 'string'
    || !isRealDate(requestedDay) || Math.abs(daysBetween(requestedDay, today)) > 2) {
    return fail(res, 400, 'Некорректный запрос');
  }

  try {
    const data = await monthData(month, today);
    res.setHeader('Cache-Control', 'public, max-age=15, s-maxage=45, stale-while-revalidate=15');
    return res.status(200).json(data);
  } catch (e) { return handleError(res, e); }
}
