'use client';

import type { ChatSession } from '@/lib/hugo/memory/policy';

export default function SessionSidebar({
  sessions,
  activeId,
  onSelect,
  onNew,
  loading,
}: {
  sessions: ChatSession[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  loading?: boolean;
}) {
  return (
    <aside className="w-56 flex-shrink-0 border-r border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col h-full">
      <div className="p-3 border-b border-slate-100 dark:border-slate-800">
        <button
          type="button"
          onClick={onNew}
          className="w-full rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-xs font-medium py-2 shadow-lg shadow-cyan-500/20 hover:opacity-95 transition"
        >
          + New chat
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {loading && (
          <p className="text-xs text-slate-500 px-2 py-2">Loading sessions…</p>
        )}
        {!loading && sessions.length === 0 && (
          <p className="text-xs text-slate-500 px-2 py-2">No sessions yet</p>
        )}
        {sessions.map((s) => {
          const active = s.id === activeId;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelect(s.id)}
              className={`w-full text-left px-3 py-2 rounded-lg text-[12px] transition ${
                active
                  ? 'bg-gradient-to-r from-cyan-500/10 to-blue-500/10 text-cyan-700 dark:text-cyan-300'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/50'
              }`}
            >
              <div className="font-medium truncate">{s.title || 'Chat'}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                {new Date(s.updatedAt).toLocaleString()}
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
