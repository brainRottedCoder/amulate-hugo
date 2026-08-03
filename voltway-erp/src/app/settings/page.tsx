'use client';

import { useState, useEffect, useCallback } from 'react';
import Header from '@/components/layout/Header';
import { collection, getDocs, addDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { authFetch } from '@/lib/auth/authFetch';

const COLLECTIONS = ['materials', 'stock_levels', 'dispatch_parameters', 'material_orders', 'sales_orders', 'suppliers'];

type MemoryRow = {
    id: string;
    type: string;
    text: string;
    importance: number;
    createdAt: string;
};

export default function SettingsPage() {
    const [backupStatus, setBackupStatus] = useState('');
    const [restoreStatus, setRestoreStatus] = useState('');
    const [loading, setLoading] = useState(false);
    const [lastBackupTime, setLastBackupTime] = useState<string | null>(null);
    const [hasBackup, setHasBackup] = useState(false);
    const [memories, setMemories] = useState<MemoryRow[]>([]);
    const [memoriesLoading, setMemoriesLoading] = useState(false);
    const [memoriesError, setMemoriesError] = useState<string | null>(null);

    const refreshMemories = useCallback(async () => {
        setMemoriesLoading(true);
        setMemoriesError(null);
        try {
            const res = await authFetch('/api/hugo/memories');
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to load memories');
            setMemories(data.memories || []);
        } catch (e) {
            setMemoriesError(e instanceof Error ? e.message : 'Failed to load memories');
        } finally {
            setMemoriesLoading(false);
        }
    }, []);

    // Check if backup exists on load
    useEffect(() => {
        const savedBackup = localStorage.getItem('voltway_backup');
        if (savedBackup) {
            const backup = JSON.parse(savedBackup);
            setLastBackupTime(backup.timestamp);
            setHasBackup(true);
        }
        void refreshMemories();
    }, [refreshMemories]);

    const deleteMemory = async (memoryId: string) => {
        setMemoriesLoading(true);
        try {
            const res = await authFetch('/api/hugo/memories', {
                method: 'DELETE',
                body: JSON.stringify({ memoryId }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Delete failed');
            await refreshMemories();
        } catch (e) {
            setMemoriesError(e instanceof Error ? e.message : 'Delete failed');
            setMemoriesLoading(false);
        }
    };

    // BACKUP: Save current Firebase data to localStorage
    const backupDatabase = async () => {
        setLoading(true);
        setBackupStatus('Backing up database...');

        try {
            const backup: { [key: string]: Record<string, unknown>[] } = {};

            for (const collectionName of COLLECTIONS) {
                const snapshot = await getDocs(collection(db, collectionName));
                backup[collectionName] = snapshot.docs.map(doc => ({
                    ...doc.data()
                }));
                setBackupStatus(`Backed up ${collectionName}...`);
            }

            // Save to localStorage with timestamp
            const backupData = {
                timestamp: new Date().toISOString(),
                data: backup
            };
            localStorage.setItem('voltway_backup', JSON.stringify(backupData));

            setLastBackupTime(backupData.timestamp);
            setHasBackup(true);
            setBackupStatus(`✅ Backup complete! Saved ${Object.values(backup).flat().length} records`);
        } catch (error: unknown) {
            setBackupStatus(`❌ Error: ${error instanceof Error ? error.message : 'Backup failed'}`);
        } finally {
            setLoading(false);
        }
    };

    // RESTORE: Load backup from localStorage and write to Firebase
    const restoreDatabase = async () => {
        const savedBackup = localStorage.getItem('voltway_backup');
        if (!savedBackup) {
            setRestoreStatus('❌ No backup found!');
            return;
        }

        setLoading(true);
        setRestoreStatus('Restoring database...');

        try {
            const backup = JSON.parse(savedBackup);

            for (const collectionName of COLLECTIONS) {
                const data = backup.data[collectionName] || [];
                const colRef = collection(db, collectionName);

                // Clear existing data
                const existing = await getDocs(colRef);
                for (const docSnap of existing.docs) {
                    await deleteDoc(doc(db, collectionName, docSnap.id));
                }

                // Restore from backup
                for (const item of data) {
                    await addDoc(colRef, item);
                }

                setRestoreStatus(`Restored ${collectionName}...`);
            }

            setRestoreStatus(`✅ Restore complete! Loaded backup from ${new Date(backup.timestamp).toLocaleString()}`);
        } catch (error: unknown) {
            setRestoreStatus(`❌ Error: ${error instanceof Error ? error.message : 'Restore failed'}`);
        } finally {
            setLoading(false);
        }
    };

    const collections = [
        { name: 'materials', label: 'Materials', icon: 'category' },
        { name: 'stock_levels', label: 'Stock Levels', icon: 'inventory_2' },
        { name: 'dispatch_parameters', label: 'Dispatch Parameters', icon: 'tune' },
        { name: 'material_orders', label: 'Purchase Orders', icon: 'shopping_cart' },
        { name: 'sales_orders', label: 'Sales Orders', icon: 'point_of_sale' },
        { name: 'suppliers', label: 'Suppliers', icon: 'local_shipping' },
    ];

    return (
        <>
            <Header title="Settings" />
            <div className="p-8 max-w-[1200px] w-full mx-auto space-y-6">
                {/* General Settings */}
                <div className="bg-white dark:bg-[#262626] rounded border border-gray-200 dark:border-[#404040] shadow-sm">
                    <div className="px-5 py-4 border-b border-gray-200 dark:border-[#404040]">
                        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-800 dark:text-slate-200">General Settings</h3>
                    </div>
                    <div className="p-5 space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="font-medium text-slate-900 dark:text-white">Dark Mode</p>
                                <p className="text-sm text-slate-500">Enable dark theme for the interface</p>
                            </div>
                            <button className="w-12 h-6 bg-slate-200 dark:bg-[#595959] rounded-full relative transition-colors">
                                <span className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform dark:translate-x-6"></span>
                            </button>
                        </div>
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="font-medium text-slate-900 dark:text-white">Email Notifications</p>
                                <p className="text-sm text-slate-500">Receive alerts for critical events</p>
                            </div>
                            <button className="w-12 h-6 bg-[#595959] rounded-full relative">
                                <span className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full"></span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Backup & Restore - UPDATED */}
                <div className="bg-white dark:bg-[#262626] rounded border border-gray-200 dark:border-[#404040] shadow-sm">
                    <div className="px-5 py-4 border-b border-gray-200 dark:border-[#404040]">
                        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-800 dark:text-slate-200">Backup & Restore</h3>
                        <p className="text-xs text-slate-500 mt-1">Save your current database or restore from previous backup</p>
                    </div>
                    <div className="p-5 space-y-6">
                        {/* Backup Section */}
                        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-5">
                            <div className="flex items-start justify-between">
                                <div className="flex items-start gap-4">
                                    <div className="p-3 bg-green-100 dark:bg-green-900/40 rounded-lg">
                                        <span className="material-symbols-outlined text-green-600 text-2xl">backup</span>
                                    </div>
                                    <div>
                                        <h4 className="font-semibold text-green-900 dark:text-green-300">Backup Current Database</h4>
                                        <p className="text-sm text-green-700 dark:text-green-400 mt-1">
                                            Save all your current data (materials, orders, stock, etc.) as a backup
                                        </p>
                                        {lastBackupTime && (
                                            <p className="text-xs text-green-600 dark:text-green-500 mt-2">
                                                Last backup: {new Date(lastBackupTime).toLocaleString()}
                                            </p>
                                        )}
                                    </div>
                                </div>
                                <button
                                    onClick={backupDatabase}
                                    disabled={loading}
                                    className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
                                >
                                    <span className="material-symbols-outlined text-[20px]">cloud_upload</span>
                                    {loading ? 'Saving...' : 'Save Backup'}
                                </button>
                            </div>
                            {backupStatus && (
                                <p className="mt-3 text-sm text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-3 py-2 rounded">
                                    {backupStatus}
                                </p>
                            )}
                        </div>

                        {/* Restore Section */}
                        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-5">
                            <div className="flex items-start justify-between">
                                <div className="flex items-start gap-4">
                                    <div className="p-3 bg-amber-100 dark:bg-amber-900/40 rounded-lg">
                                        <span className="material-symbols-outlined text-amber-600 text-2xl">restore</span>
                                    </div>
                                    <div>
                                        <h4 className="font-semibold text-amber-900 dark:text-amber-300">Restore from Backup</h4>
                                        <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
                                            {hasBackup
                                                ? 'Restore your saved backup (will overwrite current data)'
                                                : 'No backup available yet. Save a backup first!'}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={restoreDatabase}
                                    disabled={loading || !hasBackup}
                                    className="flex items-center gap-2 px-5 py-2.5 bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-700 transition-colors disabled:opacity-50"
                                >
                                    <span className="material-symbols-outlined text-[20px]">cloud_download</span>
                                    {loading ? 'Restoring...' : 'Restore Backup'}
                                </button>
                            </div>
                            {restoreStatus && (
                                <p className="mt-3 text-sm text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-3 py-2 rounded">
                                    {restoreStatus}
                                </p>
                            )}
                        </div>

                        {/* Collections Info */}
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                            {collections.map((col) => (
                                <div key={col.name} className="bg-slate-50 dark:bg-slate-800/50 rounded p-3 text-center border border-gray-200 dark:border-[#404040]">
                                    <span className="material-symbols-outlined text-[#595959] text-xl">{col.icon}</span>
                                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{col.label}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Hugo long-term memories */}
                <div className="bg-white dark:bg-[#262626] rounded border border-gray-200 dark:border-[#404040] shadow-sm">
                    <div className="px-5 py-4 border-b border-gray-200 dark:border-[#404040]">
                        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-800 dark:text-slate-200">Hugo Memories</h3>
                        <p className="text-xs text-slate-500 mt-1">Long-term preferences Hugo recalls across chats</p>
                    </div>
                    <div className="p-5 space-y-3">
                        {memoriesLoading && <p className="text-sm text-slate-500">Loading memories…</p>}
                        {memoriesError && <p className="text-sm text-red-600">{memoriesError}</p>}
                        {!memoriesLoading && memories.length === 0 && (
                            <p className="text-sm text-slate-500">No long-term memories yet. Tell Hugo to remember a preference in chat.</p>
                        )}
                        {memories.map((m) => (
                            <div
                                key={m.id}
                                className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-3"
                            >
                                <div className="min-w-0">
                                    <p className="text-sm text-slate-900 dark:text-white">{m.text}</p>
                                    <p className="text-xs text-slate-500 mt-1">
                                        {m.type} · importance {m.importance} · {new Date(m.createdAt).toLocaleString()}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => void deleteMemory(m.id)}
                                    disabled={memoriesLoading}
                                    className="text-xs text-red-600 hover:text-red-700 disabled:opacity-50"
                                >
                                    Delete
                                </button>
                            </div>
                        ))}
                        <button
                            type="button"
                            onClick={() => void refreshMemories()}
                            className="text-xs text-cyan-700 dark:text-cyan-400 hover:underline"
                        >
                            Refresh
                        </button>
                    </div>
                </div>

                {/* Data Integrations */}
                <div className="bg-white dark:bg-[#262626] rounded border border-gray-200 dark:border-[#404040] shadow-sm">
                    <div className="px-5 py-4 border-b border-gray-200 dark:border-[#404040]">
                        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-800 dark:text-slate-200">Data Integrations</h3>
                    </div>
                    <div className="p-5 space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="size-10 bg-green-100 dark:bg-green-900/30 rounded flex items-center justify-center">
                                    <span className="material-symbols-outlined text-green-600">check_circle</span>
                                </div>
                                <div>
                                    <p className="font-medium text-slate-900 dark:text-white">Firebase Firestore</p>
                                    <p className="text-sm text-slate-500">Connected • Real-time sync active</p>
                                </div>
                            </div>
                            <span className="px-2 py-1 text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded">
                                Online
                            </span>
                        </div>
                    </div>
                </div>

                {/* About */}
                <div className="bg-white dark:bg-[#262626] rounded border border-gray-200 dark:border-[#404040] shadow-sm p-5">
                    <div className="flex items-center gap-3">
                        <div className="bg-[#595959] aspect-square rounded size-10 flex items-center justify-center text-white">
                            <span className="material-symbols-outlined">electric_scooter</span>
                        </div>
                        <div>
                            <h3 className="font-bold text-slate-900 dark:text-white">Voltway ERP</h3>
                            <p className="text-sm text-slate-500">Version 1.0.0 • AI-Native ERP with Firebase</p>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
