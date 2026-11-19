// Применяем тему до отрисовки страницы.
try {
  document.documentElement.dataset.theme = localStorage.getItem('theme')
    || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
} catch { /* ignore */ }
