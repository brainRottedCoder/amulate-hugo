export type StoreMode = 'firestore' | 'memory';

/**
 * Serverless (Vercel) cannot use the Firebase web SDK reliably.
 * Default to memory unless FIRESTORE_SERVER or BUDGET_STORE=firestore.
 */
export function getServerStoreMode(): StoreMode {
  if (process.env.VITEST) return 'memory';
  if (process.env.FIRESTORE_SERVER === 'true') return 'firestore';
  if (process.env.BUDGET_STORE === 'firestore') return 'firestore';
  return 'memory';
}
