import { Firestore, FieldValue } from '@google-cloud/firestore';

let db;
export function getDb() {
  if (!db) {
    const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    db = new Firestore({
      projectId: key.project_id,
      credentials: { client_email: key.client_email, private_key: key.private_key.replace(/\\n/g, '\n') },
    });
  }
  return db;
}
export { FieldValue };
