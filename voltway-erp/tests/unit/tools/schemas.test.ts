import { describe, expect, it } from 'vitest';
import {
  createMaterialSchema,
  deleteRecordSchema,
  queryInventorySchema,
  sendReorderEmailSchema,
  updateStockSchema,
} from '@/lib/validation/hugo-tools';

describe('hugo tool zod schemas', () => {
  it('query_inventory accepts valid', () => {
    expect(queryInventorySchema.parse({ status: 'critical', limit: 10 })).toMatchObject({
      status: 'critical',
      limit: 10,
    });
  });

  it('update_stock accepts valid and rejects missing partId', () => {
    expect(
      updateStockSchema.parse({ partId: 'P305', quantityAvailable: 200 })
    ).toMatchObject({ partId: 'P305', quantityAvailable: 200 });
    expect(() => updateStockSchema.parse({ quantityAvailable: 200 })).toThrow();
  });

  it('update_stock allows 0 but create_material rejects negative stock via min', () => {
    expect(updateStockSchema.parse({ partId: 'P1', quantityAvailable: 0 }).quantityAvailable).toBe(0);
    expect(() =>
      createMaterialSchema.parse({
        partId: 'P9',
        partName: 'X',
        stock: -1,
      })
    ).toThrow();
  });

  it('send_reorder_email requires email', () => {
    expect(() =>
      sendReorderEmailSchema.parse({ partId: 'P305', supplierEmail: 'bad' })
    ).toThrow();
    expect(
      sendReorderEmailSchema.parse({
        partId: 'P305',
        supplierEmail: 'a@b.com',
      }).supplierEmail
    ).toBe('a@b.com');
  });

  it('delete_record requires reason', () => {
    expect(() =>
      deleteRecordSchema.parse({
        collection: 'materials',
        searchField: 'part_id',
        searchValue: 'P1',
        reason: 'ab',
      })
    ).toThrow();
  });
});
