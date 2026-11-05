import { currentUser, csrfOk, verifyGoogle, loginUser, signSession, sessionCookie } from '../server/auth.js';
import { send, fail, handleError } from '../server/http.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') {
      return send(res, 200, { user: await currentUser(req), clientId: process.env.GOOGLE_CLIENT_ID ?? '' });
    }
    if (!csrfOk(req)) return fail(res, 403, 'Запрос отклонён');

    if (req.method === 'POST') {
      const profile = await verifyGoogle(String(req.body?.credential ?? ''));
      const user = await loginUser(profile);
      res.setHeader('Set-Cookie', sessionCookie(req, signSession(user.id)));
      return send(res, 200, { user });
    }
    if (req.method === 'DELETE') {
      res.setHeader('Set-Cookie', sessionCookie(req, '', 0));
      return send(res, 200, { ok: true });
    }
    return fail(res, 405, 'Метод не поддерживается');
  } catch (e) { return handleError(res, e); }
}
