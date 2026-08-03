'use client';

import { useState } from 'react';
import Header from '@/components/layout/Header';
import Modal, { ConfirmDialog } from '@/components/ui/Modal';
import { useStockLevels, useMaterials, useDispatchParameters, updateDocument, deleteDocument } from '@/lib/useFirestore';

const PAGE_SIZE = 50;

interface StockLevel {
    id?: string;
    part_id: string;
    part_name: string;
    location: string;
    quantity_available: number;
}

export default function InventoryPage() {
    const { data: stockLevels, loading, error } = useStockLevels();
    const { data: materials } = useMaterials();
    const { data: dispatchParameters } = useDispatchParameters();
    const [searchTerm, setSearchTerm] = useState('');
    const [locationFilter, setLocationFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [page, setPage] = useState(0);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    const [currentStock, setCurrentStock] = useState<StockLevel | null>(null);
    const [saving, setSaving] = useState(false);

    // Get dispatch parameters for a part
    const getDispatchParams = (partId: string) => {
        return dispatchParameters.find((d: any) => d.part_id === partId);
    };

    // Determine stock status
    const getStockStatus = (stock: any) => {
        const dispatch = getDispatchParams(stock.part_id);
        const minStock = dispatch?.min_stock_level || 50;
        if (stock.quantity_available <= minStock * 0.5) return 'critical';
        if (stock.quantity_available <= minStock) return 'low';
        return 'healthy';
    };

    // Filter stock levels
    const filteredStock = stockLevels.filter((s: any) => {
        const matchesSearch = s.part_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            s.part_name?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesLocation = locationFilter === 'all' || s.location === locationFilter;
        const status = getStockStatus(s);
        const matchesStatus = statusFilter === 'all' || status === statusFilter;
        return matchesSearch && matchesLocation && matchesStatus;
    });

    const pageCount = Math.max(1, Math.ceil(filteredStock.length / PAGE_SIZE));
    const safePage = Math.min(page, pageCount - 1);
    const pagedStock = filteredStock.slice(
        safePage * PAGE_SIZE,
        safePage * PAGE_SIZE + PAGE_SIZE
    );

    // Get unique locations
    const locations = [...new Set(stockLevels.map((s: any) => s.location))].filter(Boolean);

    const openEditModal = (stock: StockLevel) => {
        setCurrentStock(stock);
        setIsModalOpen(true);
    };

    const openDeleteDialog = (stock: StockLevel) => {
        setCurrentStock(stock);
        setIsDeleteOpen(true);
    };

    const handleSave = async () => {
        if (!currentStock?.id) return;

        setSaving(true);
        try {
            await updateDocument('stock_levels', currentStock.id, {
                location: currentStock.location,
                quantity_available: Number(currentStock.quantity_available),
            });
            setIsModalOpen(false);
        } catch (err) {
            console.error('Error updating stock:', err);
            alert('Error updating stock level');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (currentStock?.id) {
            try {
                await deleteDocument('stock_levels', currentStock.id);
            } catch (err) {
                console.error('Error deleting stock:', err);
                alert('Error deleting stock level');
            }
        }
    };

    // Stats
    const totalItems = stockLevels.length;
    const criticalItems = stockLevels.filter((s: any) => getStockStatus(s) === 'critical').length;
    const lowItems = stockLevels.filter((s: any) => getStockStatus(s) === 'low').length;
    const totalValue = stockLevels.reduce((sum: number, s: any) => sum + (s.quantity_available || 0), 0);

    if (loading) {
        return (
            <>
                <Header title="Inventory" />
                <div className="p-8 flex items-center justify-center">
                    <div className="text-slate-500">Loading inventory...</div>
                </div>
            </>
        );
    }

    if (error) {
        return (
            <>
                <Header title="Inventory" />
                <div className="p-8">
                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded p-4 text-red-700 dark:text-red-400">
                        Error loading inventory. Make sure Firebase is configured and Firestore rules allow access.
                    </div>
                </div>
            </>
        );
    }

    return (
        <>
            <Header title="Inventory" />
            <div className="p-8 max-w-[1600px] w-full mx-auto space-y-6">
                {/* Stats Cards */}
                <div className="grid grid-cols-4 gap-4">
                    <div className="bg-white dark:bg-[#262626] rounded border border-gray-200 dark:border-[#404040] p-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded">
                                <span className="material-symbols-outlined text-blue-600 dark:text-blue-400">inventory_2</span>
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-slate-900 dark:text-white">{totalItems}</p>
                                <p className="text-sm text-slate-500">Total Items</p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white dark:bg-[#262626] rounded border border-gray-200 dark:border-[#404040] p-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-red-50 dark:bg-red-900/20 rounded">
                                <span className="material-symbols-outlined text-red-600 dark:text-red-400">error</span>
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-red-600 dark:text-red-400">{criticalItems}</p>
                                <p className="text-sm text-slate-500">Critical Stock</p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white dark:bg-[#262626] rounded border border-gray-200 dark:border-[#404040] p-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-amber-50 dark:bg-amber-900/20 rounded">
                                <span className="material-symbols-outlined text-amber-600 dark:text-amber-400">warning</span>
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{lowItems}</p>
                                <p className="text-sm text-slate-500">Low Stock</p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white dark:bg-[#262626] rounded border border-gray-200 dark:border-[#404040] p-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-green-50 dark:bg-green-900/20 rounded">
                                <span className="material-symbols-outlined text-green-600 dark:text-green-400">trending_up</span>
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-slate-900 dark:text-white">{totalValue.toLocaleString()}</p>
                                <p className="text-sm text-slate-500">Total Units</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Info Banner */}
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded p-4 flex items-start gap-3">
                    <span className="material-symbols-outlined text-blue-600 dark:text-blue-400">info</span>
                    <div>
                        <p className="text-sm text-blue-800 dark:text-blue-300">
                            <strong>Note:</strong> To add new inventory items, please use the <a href="/materials" className="underline font-medium">Materials</a> page.
                            Inventory entries are automatically created when you add a new material. This page is for viewing and editing existing stock levels.
                        </p>
                    </div>
                </div>

                {/* Header Actions */}
                <div className="flex justify-between items-center flex-wrap gap-4">
                    <div className="flex items-center gap-4 flex-wrap">
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 material-symbols-outlined text-[20px]">search</span>
                            <input
                                className="pl-10 pr-4 py-2 bg-white dark:bg-[#262626] border border-gray-200 dark:border-[#404040] rounded text-sm w-80 focus:ring-2 focus:ring-[#595959]/20 text-slate-900 dark:text-white placeholder-slate-500 focus:outline-none"
                                placeholder="Search by part ID or name..."
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <select
                            className="px-3 py-2 bg-white dark:bg-[#262626] border border-gray-200 dark:border-[#404040] rounded text-sm text-slate-900 dark:text-white"
                            value={locationFilter}
                            onChange={(e) => setLocationFilter(e.target.value)}
                        >
                            <option value="all">All Locations</option>
                            {locations.map((loc: any) => (
                                <option key={loc} value={loc}>{loc}</option>
                            ))}
                        </select>
                        <select
                            className="px-3 py-2 bg-white dark:bg-[#262626] border border-gray-200 dark:border-[#404040] rounded text-sm text-slate-900 dark:text-white"
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                        >
                            <option value="all">All Status</option>
                            <option value="healthy">Healthy</option>
                            <option value="low">Low Stock</option>
                            <option value="critical">Critical</option>
                        </select>
                    </div>
                </div>

                {/* Inventory Table */}
                <div className="bg-white dark:bg-[#262626] rounded border border-gray-200 dark:border-[#404040] shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 border-b border-gray-200 dark:border-[#404040]">
                                <tr>
                                    <th className="px-5 py-3 font-medium text-xs uppercase tracking-wider">Part ID</th>
                                    <th className="px-5 py-3 font-medium text-xs uppercase tracking-wider">Part Name</th>
                                    <th className="px-5 py-3 font-medium text-xs uppercase tracking-wider">Location</th>
                                    <th className="px-5 py-3 font-medium text-xs uppercase tracking-wider">Quantity</th>
                                    <th className="px-5 py-3 font-medium text-xs uppercase tracking-wider">Min Stock</th>
                                    <th className="px-5 py-3 font-medium text-xs uppercase tracking-wider">Status</th>
                                    <th className="px-5 py-3 font-medium text-xs uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-[#404040]">
                                {pagedStock.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="px-5 py-8 text-center text-slate-500">
                                            No inventory items found. Add materials via the Materials page to create inventory entries.
                                        </td>
                                    </tr>
                                ) : (
                                    pagedStock.map((stock: any) => {
                                        const status = getStockStatus(stock);
                                        const dispatch = getDispatchParams(stock.part_id);
                                        const minStock = dispatch?.min_stock_level || 50;
                                        const percentFull = Math.min(100, (stock.quantity_available / minStock) * 100);

                                        return (
                                            <tr key={stock.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                                                <td className="px-5 py-4 font-mono text-slate-900 dark:text-white font-medium">{stock.part_id}</td>
                                                <td className="px-5 py-4 text-slate-900 dark:text-white">{stock.part_name}</td>
                                                <td className="px-5 py-4">
                                                    <span className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded text-xs font-medium text-slate-700 dark:text-slate-300">
                                                        {stock.location}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-4">
                                                    <div className="flex flex-col gap-1">
                                                        <span className={`font-semibold ${status === 'critical' ? 'text-red-600 dark:text-red-400' :
                                                                status === 'low' ? 'text-amber-600 dark:text-amber-400' :
                                                                    'text-slate-900 dark:text-white'
                                                            }`}>{stock.quantity_available}</span>
                                                        <div className="w-24 h-1.5 bg-slate-200 dark:bg-slate-700 rounded overflow-hidden">
                                                            <div
                                                                className={`h-full rounded ${status === 'critical' ? 'bg-red-500' :
                                                                        status === 'low' ? 'bg-amber-500' :
                                                                            'bg-green-500'
                                                                    }`}
                                                                style={{ width: `${percentFull}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-5 py-4 text-slate-500">{minStock}</td>
                                                <td className="px-5 py-4">
                                                    {status === 'critical' ? (
                                                        <span className="px-2 py-1 rounded text-xs font-bold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                                                            Critical
                                                        </span>
                                                    ) : status === 'low' ? (
                                                        <span className="px-2 py-1 rounded text-xs font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                                                            Low Stock
                                                        </span>
                                                    ) : (
                                                        <span className="px-2 py-1 rounded text-xs font-bold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                                                            Healthy
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-5 py-4">
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            onClick={() => openEditModal(stock)}
                                                            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
                                                            title="Edit stock level"
                                                        >
                                                            <span className="material-symbols-outlined text-[18px]">edit</span>
                                                        </button>
                                                        <button
                                                            onClick={() => openDeleteDialog(stock)}
                                                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                                                            title="Delete stock entry"
                                                        >
                                                            <span className="material-symbols-outlined text-[18px]">delete</span>
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                    {/* Footer */}
                    <div className="px-5 py-4 border-t border-gray-200 dark:border-[#404040] flex justify-between items-center gap-3">
                        <p className="text-sm text-slate-500">
                            Showing {pagedStock.length ? safePage * PAGE_SIZE + 1 : 0}–
                            {safePage * PAGE_SIZE + pagedStock.length} of {filteredStock.length} items
                        </p>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                disabled={safePage <= 0}
                                onClick={() => setPage((p) => Math.max(0, p - 1))}
                                className="px-3 py-1.5 text-xs rounded border border-slate-200 dark:border-slate-700 disabled:opacity-40"
                            >
                                Prev
                            </button>
                            <span className="text-xs text-slate-500">
                                Page {safePage + 1} / {pageCount}
                            </span>
                            <button
                                type="button"
                                disabled={safePage >= pageCount - 1}
                                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                                className="px-3 py-1.5 text-xs rounded border border-slate-200 dark:border-slate-700 disabled:opacity-40"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Edit Modal - Only for editing, not adding */}
            <Modal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title="Edit Stock Level"
            >
                {currentStock && (
                    <div className="space-y-4">
                        <div className="bg-slate-50 dark:bg-slate-800 rounded p-3 border border-gray-200 dark:border-[#404040]">
                            <p className="text-sm text-slate-500">Editing stock for:</p>
                            <p className="font-medium text-slate-900 dark:text-white">{currentStock.part_id} - {currentStock.part_name}</p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Location</label>
                            <select
                                value={currentStock.location}
                                onChange={(e) => setCurrentStock(prev => prev ? { ...prev, location: e.target.value } : null)}
                                className="w-full px-3 py-2 border border-gray-200 dark:border-[#404040] rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                            >
                                <option value="WH1">WH1 - Main Warehouse</option>
                                <option value="WH2">WH2 - Secondary</option>
                                <option value="WH3">WH3 - Overflow</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Quantity Available</label>
                            <input
                                type="number"
                                value={currentStock.quantity_available}
                                onChange={(e) => setCurrentStock(prev => prev ? { ...prev, quantity_available: parseInt(e.target.value) || 0 } : null)}
                                className="w-full px-3 py-2 border border-gray-200 dark:border-[#404040] rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                            />
                        </div>

                        <p className="text-xs text-slate-500">
                            To change minimum stock levels or reorder settings, use the <a href="/dispatch" className="underline">Dispatch Parameters</a> page.
                        </p>

                        <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-[#404040]">
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="px-4 py-2 text-sm font-medium text-white bg-[#595959] hover:bg-slate-700 rounded transition-colors disabled:opacity-50"
                            >
                                {saving ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                )}
            </Modal>

            {/* Delete Confirmation */}
            <ConfirmDialog
                isOpen={isDeleteOpen}
                onClose={() => setIsDeleteOpen(false)}
                onConfirm={handleDelete}
                title="Delete Stock Entry"
                message={`Are you sure you want to delete the stock entry for "${currentStock?.part_name}"? This won't delete the material itself.`}
                confirmText="Delete"
                confirmVariant="danger"
            />
        </>
    );
}
