import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { PolicyError } from '@/lib/auth/rbac';
import { ALLOWED_COLLECTIONS } from '@/lib/hugo/tools/types';

export function assertAllowedCollection(name: string): void {
  if (!(ALLOWED_COLLECTIONS as readonly string[]).includes(name)) {
    throw new PolicyError(`Collection '${name}' is not allowed`);
  }
}

export async function assertPartExists(partId: string): Promise<void> {
  const snap = await getDocs(
    query(collection(db, 'materials'), where('part_id', '==', partId))
  );
  if (snap.empty) {
    const stock = await getDocs(
      query(collection(db, 'stock_levels'), where('part_id', '==', partId))
    );
    if (stock.empty) {
      throw new PolicyError(`Part '${partId}' does not exist`);
    }
  }
}

export async function assertSupplierEmail(
  email: string,
  opts?: { allowAdminOverride?: boolean }
): Promise<void> {
  if (opts?.allowAdminOverride) return;
  const snap = await getDocs(collection(db, 'suppliers'));
  const match = snap.docs.some((d) => {
    const e = String(d.data().email || '').toLowerCase();
    return e && e === email.toLowerCase();
  });
  if (!match) {
    throw new PolicyError(
      `Supplier email '${email}' is not on file. Admin override required.`
    );
  }
}

export function assertNonNegativeStock(qty: number): void {
  if (qty < 0) throw new PolicyError('Stock cannot be negative');
}
