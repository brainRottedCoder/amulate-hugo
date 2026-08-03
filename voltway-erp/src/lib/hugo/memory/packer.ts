import {
  MEMORY_POLICY,
  estimateTokens,
  truncateOcr,
  type LongTermMemory,
  type PackedContext,
} from '@/lib/hugo/memory/policy';

export function packHugoContext(input: {
  longTermMemories?: LongTermMemory[];
  sessionSummary?: string | null;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  liveFacts?: string;
  userMessage: string;
  fileContext?: string;
  budgetTokens?: number;
}): PackedContext {
  const budget = input.budgetTokens ?? MEMORY_POLICY.modelContextBudgetTokens;
  const packingLog: string[] = [];
  let droppedVerbatimCount = 0;

  const memories = (input.longTermMemories || [])
    .slice()
    .sort((a, b) => b.importance - a.importance)
    .slice(0, MEMORY_POLICY.maxLongTermMemories);

  const memoryBlock = memories.length
    ? `## Long-term memories\n${memories.map((m) => `- (${m.type}, i=${m.importance}) ${m.text}`).join('\n')}`
    : '';

  let summary = (input.sessionSummary || '').trim();
  if (estimateTokens(summary) > MEMORY_POLICY.maxSummaryTokens) {
    const maxChars = MEMORY_POLICY.maxSummaryTokens * MEMORY_POLICY.charsPerToken;
    summary = summary.slice(0, maxChars) + '\n[summary truncated]';
    packingLog.push('truncated_summary');
  }
  const summaryBlock = summary ? `## Session summary\n${summary}` : '';

  const liveFacts = (input.liveFacts || '').trim();
  const liveBlock = liveFacts ? `## Live facts\n${liveFacts}` : '';

  const { text: ocr, truncated } = truncateOcr(input.fileContext || '');
  if (truncated) packingLog.push('ocr_truncated');

  let recent = [...(input.conversationHistory || [])];
  // Keep at most recentMessages, drop oldest first when over budget
  if (recent.length > MEMORY_POLICY.recentMessages) {
    droppedVerbatimCount += recent.length - MEMORY_POLICY.recentMessages;
    recent = recent.slice(-MEMORY_POLICY.recentMessages);
    packingLog.push(`cap_recent_to_${MEMORY_POLICY.recentMessages}`);
  }

  const fixedParts = [memoryBlock, summaryBlock, liveBlock, input.userMessage, ocr]
    .filter(Boolean)
    .join('\n\n');
  const fixedTokens = estimateTokens(fixedParts);

  // Drop oldest verbatim messages until under budget
  while (recent.length > 0) {
    const recentText = recent.map((m) => `${m.role}: ${m.content}`).join('\n');
    const total = fixedTokens + estimateTokens(recentText);
    if (total <= budget) break;
    recent.shift();
    droppedVerbatimCount += 1;
    packingLog.push('drop_oldest_verbatim');
  }

  // If still over budget, trim live facts (keep summary + memories)
  let live = liveBlock;
  const recentText = recent.map((m) => `${m.role}: ${m.content}`).join('\n');
  let total =
    estimateTokens([memoryBlock, summaryBlock, live, input.userMessage, ocr, recentText].filter(Boolean).join('\n\n'));
  if (total > budget && live) {
    live = '';
    packingLog.push('drop_live_facts');
    total = estimateTokens(
      [memoryBlock, summaryBlock, input.userMessage, ocr, recentText].filter(Boolean).join('\n\n')
    );
  }

  const systemExtras = [memoryBlock, summaryBlock, live].filter(Boolean).join('\n\n');

  packingLog.push(`estimated_tokens=${total}`);

  return {
    systemExtras,
    recentMessages: recent,
    ocrTruncated: ocr,
    estimatedTokens: total,
    droppedVerbatimCount,
    packingLog,
  };
}
