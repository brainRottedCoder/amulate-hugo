import {
  materials,
  stockLevels,
  dispatchParameters,
  materialOrders,
  salesOrders,
  suppliers,
} from '@/lib/data';

export type CatalogRow = Record<string, unknown> & { id: string };

const withId = <T extends object>(rows: T[], idKey: string): CatalogRow[] =>
  rows.map((row, i) => {
    const rec = row as Record<string, unknown>;
    const raw = rec[idKey];
    const id = typeof raw === 'string' && raw ? raw : `${idKey}-${i}`;
    return { id, ...rec };
  });

export function getCatalogRows(collectionName: string): CatalogRow[] {
  switch (collectionName) {
    case 'materials':
      return withId(materials, 'part_id');
    case 'stock_levels':
      return withId(stockLevels, 'part_id');
    case 'dispatch_parameters':
      return withId(dispatchParameters, 'part_id');
    case 'material_orders':
      return withId(materialOrders, 'order_id');
    case 'sales_orders':
      return withId(salesOrders, 'sales_order_id');
    case 'suppliers':
      return suppliers.map((s, i) => ({
        id: `${s.supplier_id}-${s.part_id}-${i}`,
        ...s,
      }));
    case 'events':
      return [];
    default:
      return [];
  }
}
