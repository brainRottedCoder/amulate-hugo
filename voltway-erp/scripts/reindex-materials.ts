/**
 * Reindex materials into the RAG embedding store.
 *
 * Usage:
 *   npm run reindex -- --dry-run
 *   npm run reindex
 *   npm run reindex -- --limit=100
 *
 * Requires NEXT_PUBLIC_FIREBASE_* env (same as seed-firebase).
 * See docs/adr/0004-rag-provider-choice.md
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import { reindexMaterials } from '../src/lib/hugo/retrieval/index';

const dryRun = process.argv.includes('--dry-run');
const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : undefined;

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

async function main() {
  if (!firebaseConfig.projectId) {
    console.error('Missing Firebase env. Copy env.example → .env.local');
    process.exit(1);
  }

  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  const snap = await getDocs(collection(db, 'materials'));
  let materials = snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      part_id: String(data.part_id || d.id),
      part_name: String(data.part_name || ''),
      part_type: data.part_type as string | undefined,
      used_in_models: (data.used_in_models || []) as string[],
      comment: String(data.comment || ''),
    };
  });

  if (limit && Number.isFinite(limit)) {
    materials = materials.slice(0, limit);
  }

  console.log(
    `[reindex] materials=${materials.length} dryRun=${dryRun} project=${firebaseConfig.projectId}`
  );
  const result = await reindexMaterials(materials, {
    dryRun,
    mode: 'firestore',
  });
  console.log('[reindex] done', result);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
