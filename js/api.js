const HEADERS = { 'Content-Type': 'application/json', 'X-Requested-With': 'calendar' };

export async function api(path, { method = 'GET', body, cache } = {}) {
  const res = await fetch(path, {
    method, cache, credentials: 'same-origin',
    headers: method === 'GET' ? undefined : HEADERS,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try { data = await res.json(); } catch { /* пустой ответ */ }
  if (!res.ok) {
    const e = new Error(data?.error || `Ошибка ${res.status}`);
    e.status = res.status;
    throw e;
  }
  return data;
}
