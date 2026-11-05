// Публичный эндпоинт. Ответ кэшируется на CDN Vercel, поэтому база читается редко, а сайт отвечает мгновенно.
import { monthData } from '../server/calendar.js';
import { fail, handleError } from '../server/http.js';
import { isRealDate, daysBetween } from '../js/dates.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return fail(res, 405, 'Метод не поддерживается');
  const month = String(req.query.month ?? '');
  const today = String(req.query.t ?? '');
  const drift = isRealDate(today) ? Math.abs(daysBetween(today, new Date().toISOString().slice(0, 10))) : 99;
  if (!/^20[2-9]\d-(0[1-9]|1[0-2])$/.test(month) || drift > 2) return fail(res, 400, 'Некорректный запрос');

  try {
    const data = await monthData(month, today);
    res.setHeader('Cache-Control', 'public, max-age=15, s-maxage=60, stale-while-revalidate=600');
    return res.status(200).json(data);
  } catch (e) { return handleError(res, e); }
}
