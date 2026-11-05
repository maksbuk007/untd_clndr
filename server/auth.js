import crypto from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import { getDb, FieldValue } from './db.js';
import { HttpError } from './http.js';

const SESSION_DAYS = 14;
const google = new OAuth2Client();
const hmac = body => crypto.createHmac('sha256', process.env.SESSION_SECRET).update(body).digest();

/* ---- Подписанная сессия (HMAC-SHA256), хранится в HttpOnly-cookie ---- */
export function signSession(sub) {
  if (!process.env.SESSION_SECRET) throw new Error('SESSION_SECRET не задан');
  const body = Buffer.from(JSON.stringify({ sub, exp: Date.now() + SESSION_DAYS * 864e5 })).toString('base64url');
  return `${body}.${hmac(body).toString('base64url')}`;
}

function readSession(token) {
  if (!process.env.SESSION_SECRET) return null;
  const [body, sig] = String(token ?? '').split('.');
  if (!body || !sig) return null;
  const good = hmac(body);
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== good.length || !crypto.timingSafeEqual(given, good)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    return p.exp > Date.now() ? p : null;
  } catch { return null; }
}

export function sessionCookie(req, value, maxAge = SESSION_DAYS * 86400) {
  const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  return `session=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

/* ---- Вход через Google ---- */
export async function verifyGoogle(credential) {
  try {
    const ticket = await google.verifyIdToken({ idToken: credential, audience: process.env.GOOGLE_CLIENT_ID });
    const p = ticket.getPayload();
    if (!p?.sub || !p.email || !p.email_verified) throw new Error('email not verified');
    return p;
  } catch (e) {
    console.error('verifyGoogle:', e.message);
    throw new HttpError(401, 'Не удалось подтвердить вход через Google');
  }
}

// Создаёт запись пользователя при первом входе; адреса из ADMIN_EMAILS становятся админами сами
export async function loginUser(p) {
  const ref = getDb().collection('users').doc(p.sub);
  const snap = await ref.get();
  const owners = (process.env.ADMIN_EMAILS ?? '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
  const owner = owners.includes(p.email.toLowerCase());
  const profile = { email: p.email, name: p.name || p.email, photo: p.picture || '' };

  if (!snap.exists) {
    await ref.set({ ...profile, role: owner ? 'admin' : 'pending', createdAt: FieldValue.serverTimestamp() });
    return { id: p.sub, ...profile, role: owner ? 'admin' : 'pending' };
  }
  const role = owner ? 'admin' : snap.data().role;
  await ref.update({ ...profile, role });
  return { id: p.sub, ...profile, role };
}

/* ---- Текущий пользователь и защита запросов ---- */
export async function currentUser(req) {
  const s = readSession(req.cookies?.session);
  if (!s) return null;
  const snap = await getDb().collection('users').doc(s.sub).get(); // роль берётся из базы при каждом запросе
  if (!snap.exists) return null;
  const d = snap.data();
  return { id: snap.id, name: d.name, email: d.email, photo: d.photo, role: d.role };
}

// Защита от CSRF: нужен свой заголовок и совпадающий Origin (плюс cookie SameSite=Strict)
export function csrfOk(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return true;
  const origin = req.headers.origin;
  if (origin && new URL(origin).host !== req.headers.host) return false;
  return req.headers['x-requested-with'] === 'calendar';
}

export async function guard(req, roles) {
  if (!csrfOk(req)) throw new HttpError(403, 'Запрос отклонён');
  const user = await currentUser(req);
  if (!user) throw new HttpError(401, 'Нужен вход');
  if (!roles.includes(user.role)) throw new HttpError(403, 'Недостаточно прав');
  return user;
}
