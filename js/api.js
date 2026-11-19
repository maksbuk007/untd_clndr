const HEADERS = { 'Content-Type': 'application/json', 'X-Requested-With': 'calendar' };

export async function api(path, { method = 'GET', body, cache } = {}) {
  const signal = method === 'GET' ? globalThis.AbortSignal?.timeout?.(15_000) : undefined;
  try {
    const res = await fetch(path, {
      method, cache, signal, credentials: 'same-origin',
      headers: method === 'GET' ? undefined : HEADERS,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(error => {
      if (signal?.aborted) throw error;
      return null;
    });
    if (!res.ok) {
      const error = new Error(data?.error || `Ошибка сервера (${res.status})`);
      error.status = res.status;
      throw error;
    }
    if (!data || typeof data !== 'object') throw new Error('Сервер вернул некорректный ответ.');
    return data;
  } catch (error) {
    if (signal?.aborted) throw new Error('Сервер отвечает слишком долго.');
    if (error instanceof TypeError) throw new Error('Не удалось связаться с сервером.');
    throw error;
  }
}
