'use client';

import { useState, useEffect } from 'react';
import {
    collection,
    getDocs,
    doc,
    getDoc,
    addDoc,
    updateDoc,
    deleteDoc,
    onSnapshot,
    query,
    where,
    orderBy,
    limit,
    QueryConstraint,
    DocumentData
} from 'firebase/firestore';
import { db } from './firebase';

// Generic hook for fetching a collection with real-time updates
export function useFirestoreCollection<T>(
    collectionName: string,
    constraints: QueryConstraint[] = []
) {
    const [data, setData] = useState<T[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        const collectionRef = collection(db, collectionName);
        const q = constraints.length > 0
            ? query(collectionRef, ...constraints)
            : collectionRef;

        const unsubscribe = onSnapshot(
            q,
            (snapshot) => {
                const docs = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                })) as T[];
                setData(docs);
                setLoading(false);
            },
            (err) => {
                console.error(`Error fetching ${collectionName}:`, err);
                setError(err);
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }, [collectionName, JSON.stringify(constraints)]);

    return { data, loading, error };
}

// Hook for fetching a single document
export function useFirestoreDocument<T>(
    collectionName: string,
    documentId: string | null
) {
    const [data, setData] = useState<T | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        if (!documentId) {
            setLoading(false);
            return;
        }

        const docRef = doc(db, collectionName, documentId);

        const unsubscribe = onSnapshot(
            docRef,
            (snapshot) => {
                if (snapshot.exists()) {
                    setData({ id: snapshot.id, ...snapshot.data() } as T);
                } else {
                    setData(null);
                }
                setLoading(false);
            },
            (err) => {
                console.error(`Error fetching ${collectionName}/${documentId}:`, err);
                setError(err);
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }, [collectionName, documentId]);

    return { data, loading, error };
}

// CRUD operations
export async function addDocument<T extends DocumentData>(
    collectionName: string,
    data: T
): Promise<string> {
    const docRef = await addDoc(collection(db, collectionName), data);
    return docRef.id;
}

export async function updateDocument<T extends DocumentData>(
    collectionName: string,
    documentId: string,
    data: Partial<T>
): Promise<void> {
    const docRef = doc(db, collectionName, documentId);
    await updateDoc(docRef, data as DocumentData);
}

export async function deleteDocument(
    collectionName: string,
    documentId: string
): Promise<void> {
    const docRef = doc(db, collectionName, documentId);
    await deleteDoc(docRef);
}

// Specific hooks for ERP collections
/** Soft-cap listener to avoid unbounded snapshots on huge tenants (Phase 4). */
const LARGE_LIST_LIMIT = 2000;

export function useMaterials() {
    return useFirestoreCollection<{ id: string; part_id: string; part_name: string; part_type: string; used_in_models: string[]; weight: number; blocked_parts: string; successor_parts: string; comment: string; }>('materials', [
        orderBy('part_id'),
        limit(LARGE_LIST_LIMIT),
    ]);
}

export function useStockLevels() {
    return useFirestoreCollection<{ id: string; part_id: string; part_name: string; location: string; quantity_available: number; }>('stock_levels', [
        orderBy('part_id'),
        limit(LARGE_LIST_LIMIT),
    ]);
}

export function useDispatchParameters() {
    return useFirestoreCollection<{ id: string; part_id: string; min_stock_level: number; reorder_quantity: number; reorder_interval_days: number; }>('dispatch_parameters');
}

export function useMaterialOrders() {
    return useFirestoreCollection<{ id: string; order_id: string; part_id: string; quantity_ordered: number; order_date: string; expected_delivery_date: string; supplier_id: string; status: string; actual_delivered_at?: string; }>('material_orders');
}

export function useSalesOrders() {
    return useFirestoreCollection<{ id: string; sales_order_id: string; model: string; version: string; quantity: number; order_type: string; requested_date: string; created_at: string; accepted_request_date: string; }>('sales_orders');
}

export function useSuppliers() {
    return useFirestoreCollection<{ id: string; supplier_id: string; part_id: string; price_per_unit: number; lead_time_days: number; min_order_qty: number; reliability_rating: number; }>('suppliers');
}

export function useEvents() {
    return useFirestoreCollection<{ id: string; event_type: string; severity: string; title: string; description: string; affected_orders?: string[]; affected_materials?: string[]; created_at: string; requires_action: boolean; }>('events');
}

// Re-export query helpers
export { where, orderBy, limit };
