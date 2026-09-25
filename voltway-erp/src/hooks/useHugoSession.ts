'use client';

import { useCallback, useEffect, useState } from 'react';
import { authFetch } from '@/lib/auth/authFetch';
import type { ChatSession } from '@/lib/hugo/memory/policy';

export type HugoUiMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
};

export function useHugoSession() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshSessions = useCallback(async () => {
    const res = await authFetch('/api/hugo/sessions');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load sessions');
    setSessions(data.sessions || []);
    return data.sessions as ChatSession[];
  }, []);

  const createSession = useCallback(
    async (title = 'New chat') => {
      const res = await authFetch('/api/hugo/sessions', {
        method: 'POST',
        body: JSON.stringify({ title }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create session');
      await refreshSessions();
      setSessionId(data.session.id);
      return data.session as ChatSession;
    },
    [refreshSessions]
  );

  const loadSession = useCallback(async (id: string) => {
    const res = await authFetch(`/api/hugo/sessions/${id}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load session');
    setSessionId(id);
    const messages: HugoUiMessage[] = (data.messages || [])
      .filter((m: { role: string }) => m.role === 'user' || m.role === 'assistant')
      .map((m: { id: string; role: 'user' | 'assistant'; content: string; ts: string }) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: new Date(m.ts),
      }));
    return {
      messages,
      summary: data.summary as { summary?: string } | null,
      agentRun: data.agentRun as unknown,
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const list = await refreshSessions();
        if (cancelled) return;
        if (list.length > 0) {
          setSessionId(list[0].id);
        } else {
          const created = await createSession('New chat');
          if (!cancelled) setSessionId(created.id);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Session error');
          setSessionId((prev) => prev || 'local-demo');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [createSession, refreshSessions]);

  return {
    sessions,
    sessionId,
    setSessionId,
    loading,
    error,
    refreshSessions,
    createSession,
    loadSession,
  };
}
