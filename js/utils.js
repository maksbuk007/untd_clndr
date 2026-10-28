import { CATEGORIES, DEFAULT_COLOR } from './config.js';

export function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

const isHex = c => /^#[0-9a-f]{3,8}$/i.test(c);

// Для категорий, которых нет в config.js, цвет подбирается автоматически и всегда одинаков
function hashColor(s) {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `hsl(${h % 360} 62% 45%)`;
}

export const colorOf = c => (isHex(c) ? c : CATEGORIES[c]?.color ?? (c ? hashColor(c) : DEFAULT_COLOR));

// Категория = слово из колонки «Цвет». HEX и пустое значение попадают в «другое».
export const groupOf = ev => (ev.color && !isHex(ev.color) ? ev.color : 'другое');
export const groupColor = g => (g === 'другое' ? DEFAULT_COLOR : colorOf(g));
export const groupLabel = g => CATEGORIES[g]?.label ?? (g.charAt(0).toUpperCase() + g.slice(1));

export const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1);

// Текст с превращением ссылок в <a>. Только через DOM — без innerHTML, поэтому безопасно.
export function linkify(text, parent) {
  text.split(/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]])/g).forEach((part, i) => {
    if (i % 2) {
      const a = el('a', null, part);
      a.href = part;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      parent.append(a);
    } else {
      parent.append(part);
    }
  });
}
