export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const bad = message => { throw new HttpError(400, message); };
export const send = (res, status, body) => res.status(status).json(body);
export const fail = (res, status, message) => send(res, status, { error: message });

// Единая обработка ошибок: свои — как есть, чужие — коротко наружу, подробно в лог
export function handleError(res, e) {
  if (e instanceof HttpError) return fail(res, e.status, e.message);
  console.error(e);
  return fail(res, 500, 'Ошибка сервера. Проверьте настройки переменных окружения.');
}
