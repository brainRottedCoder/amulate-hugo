/**
 * Provision a tenant + admin user profile doc (Phase 5).
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/provision-tenant.ts --tenant=acme --adminUid=FIREBASE_UID --email=admin@acme.com
 *
 * Creates/updates:
 *   tenants/{tenantId}
 *   users/{adminUid} with role=admin, tenantId
 *   tenant_budgets/{tenantId}
 */

import { initializeApp } from 'firebase/app';
import { doc, getFirestore, setDoc } from 'firebase/firestore';

const tenantArg = process.argv.find((a) => a.startsWith('--tenant='));
const uidArg = process.argv.find((a) => a.startsWith('--adminUid='));
const emailArg = process.argv.find((a) => a.startsWith('--email='));
const limitArg = process.argv.find((a) => a.startsWith('--limit='));

const tenantId = tenantArg?.split('=')[1];
const adminUid = uidArg?.split('=')[1];
const email = emailArg?.split('=')[1] || null;
const limit = limitArg ? Number(limitArg.split('=')[1]) : 2_000_000;

async function main() {
  if (!tenantId || !adminUid) {
    console.error('Required: --tenant=ID --adminUid=UID [--email=] [--limit=]');
    process.exit(1);
  }

  const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };

  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  const now = new Date().toISOString();
  const period = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}`;

  await setDoc(doc(db, 'tenants', tenantId), {
    name: tenantId,
    createdAt: now,
    status: 'active',
  });

  await setDoc(
    doc(db, 'users', adminUid),
    {
      uid: adminUid,
      email,
      role: 'admin',
      tenantId,
      updatedAt: now,
      createdAt: now,
    },
    { merge: true }
  );

  await setDoc(doc(db, 'tenant_budgets', tenantId), {
    tenantId,
    monthlyTokenLimit: limit,
    tokensUsed: 0,
    period,
    updatedAt: now,
  });

  console.log('[provision-tenant] ok', { tenantId, adminUid, limit });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
