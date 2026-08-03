/**
 * Seed a large materials catalog for Phase 4 scale smoke (5k default, 10k via --count=10000).
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/seed-large-catalog.ts
 *   npx tsx --env-file=.env.local scripts/seed-large-catalog.ts --count=5000 --reindex
 *
 * WARNING: writes many Firestore docs — use staging/emulator preferred.
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, writeBatch, doc } from 'firebase/firestore';
import { reindexMaterials } from '../src/lib/hugo/retrieval/index';

const countArg = process.argv.find((a) => a.startsWith('--count='));
const COUNT = countArg ? Number(countArg.split('=')[1]) : 5000;
const doReindex = process.argv.includes('--reindex');

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const NAMES = [
  'Battery Pack',
  'Brushless Motor',
  'LCD Dashboard',
  'Comfort Seat',
  'Controller Board',
  'Brake Cable',
  'Tire Tube',
];

async function main() {
  if (!firebaseConfig.projectId) {
    console.error('Missing Firebase env');
    process.exit(1);
  }
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);

  const materials: Array<{
    id: string;
    part_id: string;
    part_name: string;
    part_type: string;
    used_in_models: string[];
    comment: string;
  }> = [];

  console.log(`[seed-large] writing ${COUNT} materials…`);
  for (let i = 0; i < COUNT; i += 400) {
    const batch = writeBatch(db);
    const end = Math.min(COUNT, i + 400);
    for (let j = i; j < end; j++) {
      const part_id = `PX${String(j).padStart(5, '0')}`;
      const part_name = `S1 ${NAMES[j % NAMES.length]} #${j}`;
      const ref = doc(collection(db, 'materials'));
      const row = {
        part_id,
        part_name,
        part_type: 'component',
        used_in_models: ['S1_V2'],
        weight: 1,
        blocked_parts: '',
        successor_parts: '',
        comment: j % 97 === 0 ? 'critical low-stock fixture' : '',
      };
      batch.set(ref, row);
      materials.push({ id: ref.id, ...row });

      const stockRef = doc(collection(db, 'stock_levels'));
      batch.set(stockRef, {
        part_id,
        part_name,
        location: 'WH1',
        quantity_available: j % 97 === 0 ? 5 : 100 + (j % 50),
      });
    }
    await batch.commit();
    console.log(`[seed-large] committed through ${end}`);
  }

  if (doReindex) {
    console.log('[seed-large] reindexing embeddings…');
    const result = await reindexMaterials(materials, { mode: 'firestore' });
    console.log('[seed-large] reindex', result);
  }

  console.log('[seed-large] done');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
