export const MEMORY_POLICY = {
  recentMessages: 16,
  summaryTriggerMessages: 24,
  maxSummaryTokens: 2000,
  maxLongTermMemories: 8,
  maxOcrChars: 20_000,
  maxOutputTokens: 8192,
  modelContextBudgetTokens: 200_000,
  /** Rough chars→tokens heuristic */
  charsPerToken: 4,
} as const;

export type MemoryType = 'preference' | 'fact' | 'constraint' | 'other';

export interface ChatSession {
  id: string;
  userId: string;
  tenantId?: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  status: 'active' | 'archived';
}

export interface ChatMessageDoc {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolTrace?: Record<string, unknown> | null;
  ts: string;
}

export interface SessionSummary {
  sessionId: string;
  summary: string;
  coveredThroughTs: string;
  updatedAt: string;
  messageCountAtSummary: number;
}

export interface LongTermMemory {
  id: string;
  userId: string;
  type: MemoryType;
  text: string;
  importance: number;
  sourceSessionId?: string;
  createdAt: string;
}

export interface AgentRun {
  id: string;
  userId: string;
  sessionId?: string;
  goal: string;
  steps: Array<{ id: string; label: string; status: 'pending' | 'done' | 'failed'; note?: string }>;
  status: 'running' | 'completed' | 'failed' | 'paused';
  createdAt: string;
  updatedAt: string;
}

export interface PackedContext {
  systemExtras: string;
  recentMessages: Array<{ role: 'user' | 'assistant'; content: string }>;
  ocrTruncated: string;
  estimatedTokens: number;
  droppedVerbatimCount: number;
  packingLog: string[];
}

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / MEMORY_POLICY.charsPerToken);
}

export function shouldTriggerSummary(messageCount: number): boolean {
  return messageCount > MEMORY_POLICY.summaryTriggerMessages;
}

export function truncateOcr(text: string): { text: string; truncated: boolean } {
  if (!text) return { text: '', truncated: false };
  if (text.length <= MEMORY_POLICY.maxOcrChars) {
    return { text, truncated: false };
  }
  return {
    text:
      text.slice(0, MEMORY_POLICY.maxOcrChars) +
      `\n\n[OCR truncated to ${MEMORY_POLICY.maxOcrChars} characters per MEMORY_POLICY]`,
    truncated: true,
  };
}

export function assertMemoryOwner(
  memoryUserId: string,
  requesterId: string,
  isAdmin = false
): void {
  if (isAdmin) return;
  if (memoryUserId !== requesterId) {
    const err = new Error('Forbidden: memory ownership mismatch');
    (err as { status?: number }).status = 403;
    throw err;
  }
}
