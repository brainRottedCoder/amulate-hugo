import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { createFireworksChatModel } from '@/lib/hugo/providers/fireworks';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import {
  MEMORY_POLICY,
  shouldTriggerSummary,
  type ChatMessageDoc,
  type SessionSummary,
} from '@/lib/hugo/memory/policy';
import { listMessages } from '@/lib/hugo/memory/session';
import { getServerStoreMode } from '@/lib/storeMode';

type Mode = 'firestore' | 'memory';

const memSummaries = new Map<string, SessionSummary>();

export function resetMemorySummaries(): void {
  memSummaries.clear();
}

export function getMemorySummariesStore(): SessionSummary[] {
  return [...memSummaries.values()];
}

export { shouldTriggerSummary };

export async function getSessionSummary(
  sessionId: string,
  mode: Mode = getServerStoreMode()
): Promise<SessionSummary | null> {
  if (mode === 'memory') return memSummaries.get(sessionId) || null;
  const snap = await getDoc(doc(db, 'session_summaries', sessionId));
  if (!snap.exists()) return null;
  return snap.data() as SessionSummary;
}

export async function maybeSummarizeSession(
  sessionId: string,
  mode: Mode = getServerStoreMode(),
  opts?: { force?: boolean; llm?: boolean }
): Promise<SessionSummary | null> {
  const messages = await listMessages(sessionId, mode);
  if (!opts?.force && !shouldTriggerSummary(messages.length)) {
    return getSessionSummary(sessionId, mode);
  }

  // Summarize older half; keep recent N verbatim in packer
  const cutoff = Math.max(0, messages.length - MEMORY_POLICY.recentMessages);
  const older = messages.slice(0, cutoff);
  if (older.length === 0) {
    return getSessionSummary(sessionId, mode);
  }

  const existing = await getSessionSummary(sessionId, mode);
  const transcript = older
    .map((m) => `${m.role}: ${m.content}`)
    .join('\n')
    .slice(0, MEMORY_POLICY.maxSummaryTokens * MEMORY_POLICY.charsPerToken);

  let summaryText: string;
  if (opts?.llm === false || mode === 'memory') {
    // Deterministic summary for tests / offline
    summaryText = [
      existing?.summary ? `Prior: ${existing.summary}` : '',
      `Covered ${older.length} older messages.`,
      `Highlights: ${older
        .slice(0, 5)
        .map((m) => m.content.slice(0, 80))
        .join(' | ')}`,
    ]
      .filter(Boolean)
      .join('\n');
  } else {
    const model = createFireworksChatModel({ maxTokens: 800, temperature: 0.2 });
    const res = await model.invoke([
      new SystemMessage(
        'Summarize this ERP chat for future context. Keep constraints, preferences, part IDs, and open actions. Max ~400 words.'
      ),
      new HumanMessage(
        `${existing?.summary ? `Previous summary:\n${existing.summary}\n\n` : ''}New messages:\n${transcript}`
      ),
    ]);
    summaryText = typeof res.content === 'string' ? res.content : String(res.content);
  }

  const coveredThroughTs = older[older.length - 1]?.ts || new Date().toISOString();
  const payload: SessionSummary = {
    sessionId,
    summary: summaryText,
    coveredThroughTs,
    updatedAt: new Date().toISOString(),
    messageCountAtSummary: messages.length,
  };

  // Never drop older messages from DB — only write summary after success
  if (mode === 'memory') {
    memSummaries.set(sessionId, payload);
    return payload;
  }

  await setDoc(doc(db, 'session_summaries', sessionId), payload);
  return payload;
}

export function buildSummaryCandidateFromMessages(messages: ChatMessageDoc[]): string {
  return messages
    .slice(0, Math.max(0, messages.length - MEMORY_POLICY.recentMessages))
    .map((m) => `${m.role}: ${m.content.slice(0, 100)}`)
    .join('\n');
}
