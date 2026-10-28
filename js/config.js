// URL веб-приложения Google Apps Script (Развернуть → Веб-приложение)
export const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycby2nTctQppHT4oQz_lw58-h46HDJILrM85ULmFlic6n8D8N2138peCF57WzCdlYrUza/exec';

export const CACHE_KEY = 'calendar:events:v2';
export const CACHE_TTL = 5 * 60 * 1000; // через сколько обновлять данные при возврате на вкладку

// Категории. В колонке «Цвет» можно писать слово из списка или HEX (#ff8800).
// Ключи — строчными буквами.
export const CATEGORIES = {
  'планерка': { label: 'Планерка', color: '#2563eb' },
  'молодежка': { label: 'Молодёжка', color: '#059669' },
  'важное': { label: 'Важное', color: '#dc2626' },
  'праздник': { label: 'Праздник', color: '#d97706' },
  'встреча': { label: 'Встреча', color: '#7c3aed' },
};
export const DEFAULT_COLOR = '#64748b';
