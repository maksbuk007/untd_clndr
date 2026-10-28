const root = document.documentElement;

export function initTheme(btn) {
  const sync = () => btn.setAttribute('aria-checked', String(root.dataset.theme === 'dark'));
  sync();
  btn.addEventListener('click', () => {
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch { /* ignore */ }
    sync();
  });
}
