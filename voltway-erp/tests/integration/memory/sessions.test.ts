import { afterEach, describe, expect, it } from 'vitest';
import {
  addMessage,
  assertSessionOwner,
  createSession,
  listMessages,
  resetMemorySessions,
} from '@/lib/hugo/memory/session';
import {
  maybeSummarizeSession,
  resetMemorySummaries,
  getSessionSummary,
} from '@/lib/hugo/memory/summary';
import { MEMORY_POLICY } from '@/lib/hugo/memory/policy';
import {
  createLongTermMemory,
  deleteLongTermMemory,
  resetLongTermMemories,
  retrieveLongTermMemories,
} from '@/lib/hugo/memory/longTerm';
import {
  createAgentRun,
  getActiveAgentRunForSession,
  resetAgentRuns,
  updateAgentRunStep,
} from '@/lib/hugo/memory/scratchpad';
import { packHugoContext } from '@/lib/hugo/memory/packer';

const MODE = 'memory' as const;

describe('memory sessions integration', () => {
  afterEach(() => {
    resetMemorySessions();
    resetMemorySummaries();
    resetLongTermMemories();
    resetAgentRuns();
  });

  it('create session → post messages → persisted', async () => {
    const session = await createSession('user-a', 'Test chat', MODE);
    await addMessage({ sessionId: session.id, role: 'user', content: 'hello' }, MODE);
    await addMessage({ sessionId: session.id, role: 'assistant', content: 'hi' }, MODE);
    const msgs = await listMessages(session.id, MODE);
    expect(msgs).toHaveLength(2);
    expect(msgs[0].content).toBe('hello');
    expect(msgs[1].content).toBe('hi');
  });

  it('30+ messages → summary exists; last 16 exact for packer', async () => {
    const session = await createSession('user-a', 'Long chat', MODE);
    for (let i = 0; i < 30; i++) {
      await addMessage(
        {
          sessionId: session.id,
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `turn-${i}`,
        },
        MODE
      );
    }
    const summary = await maybeSummarizeSession(session.id, MODE, { llm: false });
    expect(summary).not.toBeNull();
    expect(summary!.summary.length).toBeGreaterThan(0);
    expect(await getSessionSummary(session.id, MODE)).not.toBeNull();

    const msgs = await listMessages(session.id, MODE);
    expect(msgs.length).toBe(30);
    const packed = packHugoContext({
      sessionSummary: summary!.summary,
      conversationHistory: msgs.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      userMessage: 'recall early constraint',
    });
    expect(packed.recentMessages).toHaveLength(MEMORY_POLICY.recentMessages);
    expect(packed.recentMessages[MEMORY_POLICY.recentMessages - 1].content).toBe('turn-29');
  });

  it('GET session as other user → 403', async () => {
    const session = await createSession('owner', 'Private', MODE);
    await expect(assertSessionOwner(session.id, 'intruder', MODE)).rejects.toMatchObject({
      status: 403,
    });
  });

  it('refresh simulation: load session by id restores history', async () => {
    const session = await createSession('user-a', 'Resume', MODE);
    await addMessage({ sessionId: session.id, role: 'user', content: 'before refresh' }, MODE);
    await addMessage(
      { sessionId: session.id, role: 'assistant', content: 'still here' },
      MODE
    );
    const restored = await listMessages(session.id, MODE);
    expect(restored.map((m) => m.content)).toEqual(['before refresh', 'still here']);
  });

  it('long-term memory written and retrieved on new session', async () => {
    await createLongTermMemory(
      { userId: 'user-a', text: 'always use ACME for batteries', type: 'preference', importance: 8 },
      MODE
    );
    const sessionB = await createSession('user-a', 'Chat B', MODE);
    void sessionB;
    const hits = await retrieveLongTermMemories('user-a', 'batteries supplier', MODE);
    expect(hits.some((m) => /ACME/.test(m.text))).toBe(true);
  });

  it('delete memory → subsequent pack excludes it', async () => {
    const mem = await createLongTermMemory(
      { userId: 'user-a', text: 'prefer overnight shipping', importance: 9 },
      MODE
    );
    await deleteLongTermMemory(mem.id, 'user-a', MODE);
    const hits = await retrieveLongTermMemories('user-a', 'shipping', MODE);
    expect(hits.find((m) => m.id === mem.id)).toBeUndefined();
    const packed = packHugoContext({
      longTermMemories: hits,
      userMessage: 'shipping?',
    });
    expect(packed.systemExtras).not.toMatch(/overnight shipping/);
  });

  it('agent_run scratchpad resumes mid-flow', async () => {
    const session = await createSession('user-a', 'Reorder flow', MODE);
    const run = await createAgentRun(
      {
        userId: 'user-a',
        sessionId: session.id,
        goal: 'Reorder all critical',
      },
      MODE
    );
    await updateAgentRunStep(run.id, '1', 'done', 'analyzed', MODE);
    const resumed = await getActiveAgentRunForSession(session.id, 'user-a', MODE);
    expect(resumed).not.toBeNull();
    expect(resumed!.status).toBe('running');
    expect(resumed!.steps.find((s) => s.id === '1')?.status).toBe('done');
    expect(resumed!.steps.find((s) => s.id === '2')?.status).toBe('pending');
  });
});
