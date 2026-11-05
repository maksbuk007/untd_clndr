// Выполняется до отрисовки: тема без «мигания» и ранний запрос данных (экономит один круг до сервера)
try {
  document.documentElement.dataset.theme = localStorage.getItem('theme')
    || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
} catch { /* ignore */ }

if (!location.pathname.includes('admin')) {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  const key = `${d.getFullYear()}-${p(d.getMonth() + 1)}`;
  window.__first = { key, promise: fetch(`/api/calendar?month=${key}&t=${key}-${p(d.getDate())}`) };
  window.__first.promise.catch(() => {});
}
