import { z } from 'zod';

export const queryInventorySchema = z.object({
  status: z.enum(['critical', 'low', 'healthy', 'all']).optional().default('all'),
  partId: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(100).optional().default(25),
});

export const querySuppliersSchema = z.object({
  partId: z.string().min(1).optional(),
  supplierId: z.string().min(1).optional(),
  minReliability: z.number().min(0).max(1).optional(),
  limit: z.number().int().min(1).max(100).optional().default(25),
});

export const queryOrdersSchema = z.object({
  kind: z.enum(['material', 'sales', 'all']).optional().default('all'),
  status: z.string().optional(),
  orderId: z.string().optional(),
  partId: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional().default(25),
});

export const updateStockSchema = z.object({
  partId: z.string().min(1),
  quantityAvailable: z.number().finite(),
  location: z.enum(['WH1', 'WH2', 'WH3']).optional(),
});

export const createMaterialSchema = z.object({
  partId: z.string().min(1),
  partName: z.string().min(1),
  partType: z.enum(['assembly', 'service', 'component']).default('component'),
  usedInModels: z.array(z.string()).optional().default([]),
  stock: z.number().finite().min(0).default(0),
  minStock: z.number().finite().min(0).default(50),
  location: z.enum(['WH1', 'WH2', 'WH3']).default('WH1'),
});

export const markOrderDeliveredSchema = z.object({
  orderId: z.string().min(1),
});

export const sendReorderEmailSchema = z.object({
  partId: z.string().min(1),
  supplierEmail: z.string().email(),
  supplierName: z.string().optional(),
  partName: z.string().optional(),
  currentStock: z.number().optional(),
  minStock: z.number().optional(),
  reorderQuantity: z.number().int().positive().optional(),
  notes: z.string().optional(),
  confirmSend: z.boolean().optional().default(false),
  adminOverrideEmail: z.boolean().optional().default(false),
});

export const deleteRecordSchema = z.object({
  collection: z.enum([
    'materials',
    'stock_levels',
    'dispatch_parameters',
    'material_orders',
    'sales_orders',
    'suppliers',
  ]),
  searchField: z.string().min(1),
  searchValue: z.string().min(1),
  reason: z.string().min(3),
});

export const toolSchemas = {
  query_inventory: queryInventorySchema,
  query_suppliers: querySuppliersSchema,
  query_orders: queryOrdersSchema,
  update_stock: updateStockSchema,
  create_material: createMaterialSchema,
  mark_order_delivered: markOrderDeliveredSchema,
  send_reorder_email: sendReorderEmailSchema,
  delete_record: deleteRecordSchema,
} as const;

export type ToolSchemas = typeof toolSchemas;
