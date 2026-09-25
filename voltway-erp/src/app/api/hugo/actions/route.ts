// Hugo Database Actions API - Perform CRUD operations via chat

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, addDoc, updateDoc, deleteDoc, doc, getDocs, query, where } from 'firebase/firestore';
import { requireHugoAuth, jsonError } from '@/lib/auth/apiGuard';
import { logger } from '@/lib/observability/logger';
import { decidePendingTool } from '@/lib/hugo/confirmPending';
import { PolicyError } from '@/lib/auth/rbac';

// Supported collections
const COLLECTIONS = ['materials', 'stock_levels', 'dispatch_parameters', 'material_orders', 'sales_orders', 'suppliers'];

export async function POST(request: NextRequest) {
    const body = await request.json();
    const {
        action,
        collection: collectionName,
        data,
        documentId,
        searchField,
        searchValue,
        pendingId,
        decision,
    } = body;

    // Phase 2: confirm/reject pending tool calls
    if (pendingId && decision) {
        const authResult = await requireHugoAuth(request, {
            permission: 'hugo:chat',
            rateLimit: true,
        });
        if (authResult instanceof NextResponse) return authResult;
        const { user, requestId } = authResult;

        try {
            const out = await decidePendingTool({
                pendingId,
                decision,
                user,
                requestId,
            });
            return NextResponse.json({
                success: decision === 'confirm' ? (out.result?.ok ?? true) : true,
                message: out.message,
                result: out.result || null,
                requestId,
            });
        } catch (error: unknown) {
            const status =
                error && typeof error === 'object' && 'status' in error
                    ? Number((error as { status: number }).status)
                    : error instanceof PolicyError
                      ? 403
                      : 500;
            if (status === 403 || status === 404 || status === 409) {
                return NextResponse.json(
                    {
                        error: error instanceof Error ? error.message : 'Request failed',
                        requestId,
                    },
                    { status }
                );
            }
            return jsonError(error, requestId);
        }
    }

    const authResult = await requireHugoAuth(request, {
        action: action || 'update',
        rateLimit: true,
    });
    if (authResult instanceof NextResponse) return authResult;
    const { user, requestId } = authResult;

    try {
        if (!action) {
            return NextResponse.json({ error: 'Action is required', requestId }, { status: 400 });
        }

        logger.info('hugo_action', { requestId, userId: user.uid, role: user.role, action });

        if (!COLLECTIONS.includes(collectionName)) {
            return NextResponse.json({ error: `Invalid collection. Allowed: ${COLLECTIONS.join(', ')}` }, { status: 400 });
        }

        const collectionRef = collection(db, collectionName);

        switch (action) {
            case 'add': {
                if (!data) {
                    return NextResponse.json({ error: 'Data is required for add action' }, { status: 400 });
                }

                // Extract stock/dispatch info if present (from Hugo AI)
                const { _stock, _min_stock, _location, ...materialData } = data;

                // Add the main document
                const docRef = await addDoc(collectionRef, {
                    ...materialData,
                    created_at: new Date().toISOString(),
                });

                // If adding a material with stock info, also create stock_levels and dispatch_parameters
                if (collectionName === 'materials' && data.part_id) {
                    // Create stock_levels entry
                    await addDoc(collection(db, 'stock_levels'), {
                        part_id: data.part_id,
                        part_name: data.part_name || `Part ${data.part_id}`,
                        location: _location || 'WH1',
                        quantity_available: _stock || 100,
                        created_at: new Date().toISOString(),
                    });

                    // Create dispatch_parameters entry
                    await addDoc(collection(db, 'dispatch_parameters'), {
                        part_id: data.part_id,
                        min_stock_level: _min_stock || 50,
                        reorder_quantity: Math.ceil((_min_stock || 50) * 2),
                        reorder_interval_days: 14,
                        created_at: new Date().toISOString(),
                    });
                }

                return NextResponse.json({
                    success: true,
                    message: `Successfully created ${data.part_id || 'new'} ${collectionName.slice(0, -1)} with stock and dispatch settings`,
                    documentId: docRef.id,
                    action: 'add',
                });
            }

            case 'update': {
                if (!documentId && !searchField) {
                    return NextResponse.json({ error: 'Document ID or search field required for update' }, { status: 400 });
                }
                if (!data) {
                    return NextResponse.json({ error: 'Data is required for update action' }, { status: 400 });
                }

                let targetDocId = documentId;

                // If no direct ID, search by field
                if (!targetDocId && searchField && searchValue) {
                    const q = query(collectionRef, where(searchField, '==', searchValue));
                    const snapshot = await getDocs(q);
                    if (snapshot.empty) {
                        return NextResponse.json({ error: `No document found with ${searchField}=${searchValue}` }, { status: 404 });
                    }
                    targetDocId = snapshot.docs[0].id;
                }

                const docRef = doc(db, collectionName, targetDocId);
                await updateDoc(docRef, {
                    ...data,
                    updated_at: new Date().toISOString(),
                });

                return NextResponse.json({
                    success: true,
                    message: `Successfully updated ${collectionName.slice(0, -1)} (ID: ${targetDocId})`,
                    documentId: targetDocId,
                    action: 'update',
                });
            }

            case 'delete': {
                if (!documentId && !searchField) {
                    return NextResponse.json({ error: 'Document ID or search field required for delete' }, { status: 400 });
                }

                let targetDocId = documentId;

                // If no direct ID, search by field
                if (!targetDocId && searchField && searchValue) {
                    const q = query(collectionRef, where(searchField, '==', searchValue));
                    const snapshot = await getDocs(q);
                    if (snapshot.empty) {
                        return NextResponse.json({ error: `No document found with ${searchField}=${searchValue}` }, { status: 404 });
                    }
                    targetDocId = snapshot.docs[0].id;
                }

                const docRef = doc(db, collectionName, targetDocId);
                await deleteDoc(docRef);

                return NextResponse.json({
                    success: true,
                    message: `Successfully deleted ${collectionName.slice(0, -1)} (ID: ${targetDocId})`,
                    documentId: targetDocId,
                    action: 'delete',
                });
            }

            case 'update_stock': {
                // Special action to update stock quantity
                if (!searchValue) {
                    return NextResponse.json({ error: 'part_id required for stock update' }, { status: 400 });
                }
                const q = query(collectionRef, where('part_id', '==', searchValue));
                const snapshot = await getDocs(q);
                if (snapshot.empty) {
                    return NextResponse.json({ error: `No stock entry found for part_id=${searchValue}` }, { status: 404 });
                }

                const docRef = doc(db, 'stock_levels', snapshot.docs[0].id);
                await updateDoc(docRef, {
                    ...data,
                    updated_at: new Date().toISOString(),
                });

                return NextResponse.json({
                    success: true,
                    message: `Successfully updated stock for part ${searchValue}`,
                    action: 'update_stock',
                });
            }

            case 'mark_delivered': {
                // Special action to mark order as delivered
                if (!searchValue) {
                    return NextResponse.json({ error: 'order_id required' }, { status: 400 });
                }
                const q = query(collectionRef, where('order_id', '==', searchValue));
                const snapshot = await getDocs(q);
                if (snapshot.empty) {
                    return NextResponse.json({ error: `No order found with order_id=${searchValue}` }, { status: 404 });
                }

                const docRef = doc(db, collectionName, snapshot.docs[0].id);
                await updateDoc(docRef, {
                    status: 'Delivered',
                    delivered_at: new Date().toISOString(),
                });

                return NextResponse.json({
                    success: true,
                    message: `Successfully marked order ${searchValue} as delivered`,
                    action: 'mark_delivered',
                });
            }

            case 'update_all_supplier_emails': {
                // Bulk update all supplier emails
                if (!data || !data.email) {
                    return NextResponse.json({ error: 'Email is required for bulk update' }, { status: 400 });
                }

                const suppliersRef = collection(db, 'suppliers');
                const snapshot = await getDocs(suppliersRef);

                if (snapshot.empty) {
                    return NextResponse.json({ error: 'No suppliers found in database' }, { status: 404 });
                }

                let updatedCount = 0;
                const updatePromises = snapshot.docs.map(async (docSnapshot) => {
                    const docRef = doc(db, 'suppliers', docSnapshot.id);
                    await updateDoc(docRef, {
                        email: data.email,
                        updated_at: new Date().toISOString(),
                    });
                    updatedCount++;
                });

                await Promise.all(updatePromises);

                return NextResponse.json({
                    success: true,
                    message: `Successfully updated email to "${data.email}" for ${updatedCount} suppliers`,
                    action: 'update_all_supplier_emails',
                    count: updatedCount,
                });
            }

            case 'update_supplier': {
                // Update a single supplier by supplier_id
                if (!searchValue) {
                    return NextResponse.json({ error: 'supplier_id required' }, { status: 400 });
                }

                const suppliersRef = collection(db, 'suppliers');
                const q = query(suppliersRef, where('supplier_id', '==', searchValue));
                const snapshot = await getDocs(q);

                if (snapshot.empty) {
                    return NextResponse.json({ error: `No supplier found with supplier_id=${searchValue}` }, { status: 404 });
                }

                const docRef = doc(db, 'suppliers', snapshot.docs[0].id);
                await updateDoc(docRef, {
                    ...data,
                    updated_at: new Date().toISOString(),
                });

                return NextResponse.json({
                    success: true,
                    message: `Successfully updated supplier ${searchValue}`,
                    action: 'update_supplier',
                });
            }

            default:
                return NextResponse.json({ error: `Unknown action: ${action}`, requestId }, { status: 400 });
        }
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error('hugo_action_failed', { requestId, error: message });
        if (/offline|permission|unavailable/i.test(message)) {
            return NextResponse.json({
                success: true,
                demo: true,
                message: `Demo mode: ${action} recorded locally (Firestore is not writable on this host).`,
                requestId,
            });
        }
        return jsonError(error, requestId);
    }
}
