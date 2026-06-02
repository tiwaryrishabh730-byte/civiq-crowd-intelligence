import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';

function parseServiceAccount(raw?: string) {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT_KEY is invalid JSON. Use one single-line JSON string in .env.local and Vercel.',
    );
  }
}

function getFirebaseAdminApp(): App {
  if (getApps().length) {
    return getApps()[0]!;
  }

  const serviceAccount = parseServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
  if (serviceAccount) {
    return initializeApp({
      credential: cert(serviceAccount),
    });
  }

  return initializeApp();
}

let adminAuthInstance: Auth | null = null;

export function getAdminAuth(): Auth {
  if (!adminAuthInstance) {
    adminAuthInstance = getAuth(getFirebaseAdminApp());
  }
  return adminAuthInstance;
}
