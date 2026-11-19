import { Firestore } from '@google-cloud/firestore';

let db;
export function getDb() {
  if (!db) {
    let key;
    try { key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT ?? 'null'); } catch {
      throw new Error('FIREBASE_SERVICE_ACCOUNT должен содержать JSON');
    }
    if (!key || typeof key.project_id !== 'string' || typeof key.client_email !== 'string' || typeof key.private_key !== 'string') {
      throw new Error('FIREBASE_SERVICE_ACCOUNT не содержит данные сервисного аккаунта');
    }
    db = new Firestore({
      projectId: key.project_id,
      credentials: { client_email: key.client_email, private_key: key.private_key.replace(/\\n/g, '\n') },
    });
  }
  return db;
}
export { FieldPath, FieldValue, Timestamp } from '@google-cloud/firestore';
