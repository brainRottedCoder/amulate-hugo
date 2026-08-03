import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  createMaterialSchema,
  deleteRecordSchema,
  markOrderDeliveredSchema,
  sendReorderEmailSchema,
  updateStockSchema,
} from '@/lib/validation/hugo-tools';
import type { HugoToolDefinition } from '@/lib/hugo/tools/types';
import { assertPartExists, assertSupplierEmail } from '@/lib/hugo/guardrails/policy';
import { sendEmail } from '@/lib/email';
import {
  generateReorderEmailHTML,
  generateReorderEmailText,
  generateReorderSubject,
} from '@/lib/email-templates';
import type { z } from 'zod';

export const updateStockTool: HugoToolDefinition<z.infer<typeof updateStockSchema>> = {
  name: 'update_stock',
  description: 'Update quantity_available for a part in stock_levels. Requires confirmation.',
  kind: 'mutate',
  roles: ['warehouse', 'procurement', 'admin'],
  schema: updateStockSchema,
  jsonSchema: {
    type: 'object',
    properties: {
      partId: { type: 'string' },
      quantityAvailable: { type: 'number' },
      location: { type: 'string', enum: ['WH1', 'WH2', 'WH3'] },
    },
    required: ['partId', 'quantityAvailable'],
  },
  async execute(_ctx, args) {
    const parsed = updateStockSchema.parse(args);
    if (parsed.quantityAvailable < 0) {
      return { ok: false, message: 'Stock cannot be negative' };
    }
    await assertPartExists(parsed.partId);

    const q = query(
      collection(db, 'stock_levels'),
      where('part_id', '==', parsed.partId)
    );
    const snap = await getDocs(q);
    if (snap.empty) {
      return { ok: false, message: `No stock_levels row for ${parsed.partId}` };
    }

    let target = snap.docs[0];
    if (parsed.location) {
      const match = snap.docs.find((d) => d.data().location === parsed.location);
      if (!match) {
        return {
          ok: false,
          message: `No stock row for ${parsed.partId} at ${parsed.location}`,
        };
      }
      target = match;
    }

    const before = target.data();
    await updateDoc(doc(db, 'stock_levels', target.id), {
      quantity_available: parsed.quantityAvailable,
      updated_at: new Date().toISOString(),
    });

    return {
      ok: true,
      message: `Updated ${parsed.partId} stock to ${parsed.quantityAvailable}`,
      data: {
        before: { quantity_available: before.quantity_available },
        after: { quantity_available: parsed.quantityAvailable },
      },
    };
  },
};

export const createMaterialTool: HugoToolDefinition<
  z.infer<typeof createMaterialSchema>
> = {
  name: 'create_material',
  description:
    'Create a material and initialize stock_levels + dispatch_parameters. Requires confirmation.',
  kind: 'mutate',
  roles: ['procurement', 'admin'],
  schema: createMaterialSchema,
  jsonSchema: {
    type: 'object',
    properties: {
      partId: { type: 'string' },
      partName: { type: 'string' },
      partType: { type: 'string', enum: ['assembly', 'service', 'component'] },
      usedInModels: { type: 'array', items: { type: 'string' } },
      stock: { type: 'number' },
      minStock: { type: 'number' },
      location: { type: 'string', enum: ['WH1', 'WH2', 'WH3'] },
    },
    required: ['partId', 'partName'],
  },
  async execute(_ctx, args) {
    const parsed = createMaterialSchema.parse(args);
    const existing = await getDocs(
      query(collection(db, 'materials'), where('part_id', '==', parsed.partId))
    );
    if (!existing.empty) {
      return { ok: false, message: `Material ${parsed.partId} already exists` };
    }

    const materialRef = await addDoc(collection(db, 'materials'), {
      part_id: parsed.partId,
      part_name: parsed.partName,
      part_type: parsed.partType,
      used_in_models: parsed.usedInModels,
      created_at: new Date().toISOString(),
    });

    await addDoc(collection(db, 'stock_levels'), {
      part_id: parsed.partId,
      part_name: parsed.partName,
      location: parsed.location,
      quantity_available: parsed.stock,
      created_at: new Date().toISOString(),
    });

    await addDoc(collection(db, 'dispatch_parameters'), {
      part_id: parsed.partId,
      min_stock_level: parsed.minStock,
      reorder_quantity: Math.ceil(parsed.minStock * 2),
      reorder_interval_days: 14,
      created_at: new Date().toISOString(),
    });

    return {
      ok: true,
      message: `Created material ${parsed.partId} with stock ${parsed.stock}`,
      data: { materialId: materialRef.id },
    };
  },
};

export const markOrderDeliveredTool: HugoToolDefinition<
  z.infer<typeof markOrderDeliveredSchema>
> = {
  name: 'mark_order_delivered',
  description: 'Mark a material order as delivered. Requires confirmation.',
  kind: 'mutate',
  roles: ['procurement', 'admin'],
  schema: markOrderDeliveredSchema,
  jsonSchema: {
    type: 'object',
    properties: { orderId: { type: 'string' } },
    required: ['orderId'],
  },
  async execute(_ctx, args) {
    const parsed = markOrderDeliveredSchema.parse(args);
    const snap = await getDocs(
      query(
        collection(db, 'material_orders'),
        where('order_id', '==', parsed.orderId)
      )
    );
    if (snap.empty) {
      return { ok: false, message: `Order ${parsed.orderId} not found` };
    }
    const target = snap.docs[0];
    const before = target.data();
    await updateDoc(doc(db, 'material_orders', target.id), {
      status: 'delivered',
      actual_delivered_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    return {
      ok: true,
      message: `Marked ${parsed.orderId} as delivered`,
      data: { before: { status: before.status }, after: { status: 'delivered' } },
    };
  },
};

export const sendReorderEmailTool: HugoToolDefinition<
  z.infer<typeof sendReorderEmailSchema>
> = {
  name: 'send_reorder_email',
  description:
    'Prepare/send a reorder email to a supplier for a part. Mutating send requires confirmation.',
  kind: 'mutate',
  roles: ['procurement', 'admin'],
  schema: sendReorderEmailSchema,
  jsonSchema: {
    type: 'object',
    properties: {
      partId: { type: 'string' },
      supplierEmail: { type: 'string' },
      supplierName: { type: 'string' },
      partName: { type: 'string' },
      currentStock: { type: 'number' },
      minStock: { type: 'number' },
      reorderQuantity: { type: 'number' },
      notes: { type: 'string' },
      confirmSend: { type: 'boolean' },
      adminOverrideEmail: { type: 'boolean' },
    },
    required: ['partId', 'supplierEmail'],
  },
  async execute(ctx, args) {
    const parsed = sendReorderEmailSchema.parse(args);
    await assertPartExists(parsed.partId);
    await assertSupplierEmail(parsed.supplierEmail, {
      allowAdminOverride: parsed.adminOverrideEmail && ctx.role === 'admin',
    });

    const emailData = {
      supplierName: parsed.supplierName || 'Valued Supplier',
      partId: parsed.partId,
      partName: parsed.partName || parsed.partId,
      currentStock: parsed.currentStock ?? 0,
      minStock: parsed.minStock ?? 50,
      reorderQuantity: parsed.reorderQuantity ?? 100,
      notes: parsed.notes,
    };

    if (!parsed.confirmSend && !ctx.confirmSend) {
      return {
        ok: true,
        message: 'Email preview ready — confirm to send',
        data: {
          preview: true,
          to: parsed.supplierEmail,
          subject: generateReorderSubject(emailData),
          text: generateReorderEmailText(emailData),
        },
      };
    }

    const result = await sendEmail({
      to: parsed.supplierEmail,
      subject: generateReorderSubject(emailData),
      html: generateReorderEmailHTML(emailData),
      text: generateReorderEmailText(emailData),
    });

    if (!result.success) {
      return { ok: false, message: result.error || 'Email send failed' };
    }

    return {
      ok: true,
      message: `Email sent to ${parsed.supplierEmail}`,
      data: { messageId: result.messageId, preview: false },
    };
  },
};

export const deleteRecordTool: HugoToolDefinition<z.infer<typeof deleteRecordSchema>> = {
  name: 'delete_record',
  description: 'Delete a record from an allowed collection. Admin only. Requires confirmation.',
  kind: 'mutate',
  roles: ['admin'],
  schema: deleteRecordSchema,
  jsonSchema: {
    type: 'object',
    properties: {
      collection: {
        type: 'string',
        enum: [
          'materials',
          'stock_levels',
          'dispatch_parameters',
          'material_orders',
          'sales_orders',
          'suppliers',
        ],
      },
      searchField: { type: 'string' },
      searchValue: { type: 'string' },
      reason: { type: 'string' },
    },
    required: ['collection', 'searchField', 'searchValue', 'reason'],
  },
  async execute(_ctx, args) {
    const parsed = deleteRecordSchema.parse(args);
    const snap = await getDocs(
      query(
        collection(db, parsed.collection),
        where(parsed.searchField, '==', parsed.searchValue)
      )
    );
    if (snap.empty) {
      return {
        ok: false,
        message: `No document in ${parsed.collection} where ${parsed.searchField}=${parsed.searchValue}`,
      };
    }
    const target = snap.docs[0];
    const before = target.data();
    await deleteDoc(doc(db, parsed.collection, target.id));
    return {
      ok: true,
      message: `Deleted from ${parsed.collection} (${parsed.reason})`,
      data: { before },
    };
  },
};
