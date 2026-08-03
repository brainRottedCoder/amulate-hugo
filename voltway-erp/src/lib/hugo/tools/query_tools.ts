import {
  collection,
  getDocs,
  query,
  where,
  limit as fsLimit,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  queryInventorySchema,
  queryOrdersSchema,
  querySuppliersSchema,
} from '@/lib/validation/hugo-tools';
import type { HugoToolDefinition } from '@/lib/hugo/tools/types';
import type { z } from 'zod';

function stockStatus(qty: number, minStock: number): 'critical' | 'low' | 'healthy' {
  if (qty <= minStock * 0.5) return 'critical';
  if (qty <= minStock) return 'low';
  return 'healthy';
}

export const queryInventoryTool: HugoToolDefinition<
  z.infer<typeof queryInventorySchema>
> = {
  name: 'query_inventory',
  description:
    'Query inventory stock levels and health (critical/low/healthy). Use for stock questions.',
  kind: 'read',
  roles: ['viewer', 'warehouse', 'procurement', 'admin'],
  schema: queryInventorySchema,
  jsonSchema: {
    type: 'object',
    properties: {
      status: { type: 'string', enum: ['critical', 'low', 'healthy', 'all'] },
      partId: { type: 'string' },
      limit: { type: 'number' },
    },
  },
  async execute(_ctx, args) {
    const parsed = queryInventorySchema.parse(args);
    const stockSnap = await getDocs(collection(db, 'stock_levels'));
    const dispatchSnap = await getDocs(collection(db, 'dispatch_parameters'));
    const minMap = new Map<string, number>();
    dispatchSnap.docs.forEach((d) => {
      const data = d.data();
      minMap.set(data.part_id, Number(data.min_stock_level ?? 50));
    });

    let rows = stockSnap.docs.map((d) => {
      const data = d.data();
      const qty = Number(data.quantity_available ?? 0);
      const min = minMap.get(data.part_id) ?? 50;
      return {
        part_id: data.part_id,
        part_name: data.part_name,
        location: data.location,
        quantity_available: qty,
        min_stock_level: min,
        status: stockStatus(qty, min),
      };
    });

    if (parsed.partId) {
      rows = rows.filter((r) => r.part_id === parsed.partId);
    }
    if (parsed.status !== 'all') {
      rows = rows.filter((r) => r.status === parsed.status);
    }

    rows = rows.slice(0, parsed.limit);
    return {
      ok: true,
      message: `Found ${rows.length} inventory row(s)`,
      data: { items: rows },
    };
  },
};

export const querySuppliersTool: HugoToolDefinition<
  z.infer<typeof querySuppliersSchema>
> = {
  name: 'query_suppliers',
  description: 'Query supplier directory, reliability scores, lead times, and contacts.',
  kind: 'read',
  roles: ['viewer', 'warehouse', 'procurement', 'admin'],
  schema: querySuppliersSchema,
  jsonSchema: {
    type: 'object',
    properties: {
      partId: { type: 'string' },
      supplierId: { type: 'string' },
      minReliability: { type: 'number' },
      limit: { type: 'number' },
    },
  },
  async execute(_ctx, args) {
    const parsed = querySuppliersSchema.parse(args);
    const snap = await getDocs(collection(db, 'suppliers'));
    let rows = snap.docs.map((d) => {
      const data = d.data();
      return {
        supplier_id: data.supplier_id,
        supplier_name: data.supplier_name,
        part_id: data.part_id,
        email: data.email,
        phone: data.phone,
        lead_time_days: data.lead_time_days,
        reliability_score: data.reliability_score ?? data.reliability_rating,
        unit_price: data.unit_price ?? data.price_per_unit,
      };
    });

    if (parsed.partId) rows = rows.filter((r) => r.part_id === parsed.partId);
    if (parsed.supplierId) rows = rows.filter((r) => r.supplier_id === parsed.supplierId);
    if (parsed.minReliability != null) {
      rows = rows.filter(
        (r) => Number(r.reliability_score ?? 0) >= parsed.minReliability!
      );
    }
    rows.sort(
      (a, b) => Number(b.reliability_score ?? 0) - Number(a.reliability_score ?? 0)
    );
    rows = rows.slice(0, parsed.limit);

    return {
      ok: true,
      message: `Found ${rows.length} supplier(s)`,
      data: { items: rows },
    };
  },
};

export const queryOrdersTool: HugoToolDefinition<z.infer<typeof queryOrdersSchema>> = {
  name: 'query_orders',
  description: 'Query material purchase orders and/or sales orders and their statuses.',
  kind: 'read',
  roles: ['viewer', 'warehouse', 'procurement', 'admin'],
  schema: queryOrdersSchema,
  jsonSchema: {
    type: 'object',
    properties: {
      kind: { type: 'string', enum: ['material', 'sales', 'all'] },
      status: { type: 'string' },
      orderId: { type: 'string' },
      partId: { type: 'string' },
      limit: { type: 'number' },
    },
  },
  async execute(_ctx, args) {
    const parsed = queryOrdersSchema.parse(args);
    const result: Record<string, unknown> = {};

    if (parsed.kind === 'material' || parsed.kind === 'all') {
      const constraints = [];
      if (parsed.orderId) constraints.push(where('order_id', '==', parsed.orderId));
      else if (parsed.partId) constraints.push(where('part_id', '==', parsed.partId));
      const q = constraints.length
        ? query(collection(db, 'material_orders'), ...constraints, fsLimit(parsed.limit))
        : query(collection(db, 'material_orders'), fsLimit(parsed.limit));
      const snap = await getDocs(q);
      let items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (parsed.status) {
        items = items.filter(
          (i) =>
            String((i as { status?: string }).status || '').toLowerCase() ===
            parsed.status!.toLowerCase()
        );
      }
      result.material_orders = items;
    }

    if (parsed.kind === 'sales' || parsed.kind === 'all') {
      const snap = await getDocs(
        query(collection(db, 'sales_orders'), fsLimit(parsed.limit))
      );
      result.sales_orders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }

    return {
      ok: true,
      message: 'Orders retrieved',
      data: result,
    };
  },
};
