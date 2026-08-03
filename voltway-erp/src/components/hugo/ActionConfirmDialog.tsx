'use client';

import Modal from '@/components/ui/Modal';

export default function ActionConfirmDialog({
  open,
  title,
  description,
  args,
  loading,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  args?: Record<string, unknown>;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal isOpen={open} onClose={onCancel} title={title} maxWidth="max-w-lg">
      <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">{description}</p>
      {args && (
        <pre className="mb-6 max-h-48 overflow-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-3 text-xs text-slate-700 dark:text-slate-300">
          {JSON.stringify(args, null, 2)}
        </pre>
      )}
      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="px-4 py-2 text-sm font-medium rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={loading}
          className="px-4 py-2 text-sm font-medium rounded-xl text-white bg-gradient-to-r from-cyan-500 to-blue-600 shadow-lg shadow-cyan-500/20 hover:opacity-95 disabled:opacity-60 transition"
        >
          {loading ? 'Working…' : 'Confirm'}
        </button>
      </div>
    </Modal>
  );
}
