import { createFireworksChatModel, getFireworksProviderMeta } from '@/lib/hugo/providers/fireworks';
import { HUGO_SYSTEM_PROMPT_V2, PROMPT_VERSION } from '@/lib/hugo/prompts';
import {
  getTool,
  isMutatingTool,
  parseToolArgs,
  toLangChainTools,
} from '@/lib/hugo/tools/registry';
import { assertToolRole } from '@/lib/hugo/tools/registry';
import { assertToolNotBlocked } from '@/lib/hugo/guardrails/injection';
import { createPendingToolCall } from '@/lib/hugo/pending';
import { hashArgs, writeAuditLogFlexible } from '@/lib/hugo/audit';
import { MAX_TOOLS_PER_TURN, type OrchestratorInput, type OrchestratorResponse, type ToolName, type ToolResult } from '@/types/hugo';
import { TOOL_NAMES } from '@/types/hugo';
import { logger } from '@/lib/observability/logger';
import { PolicyError } from '@/lib/auth/rbac';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';
import { flags } from '@/lib/config';
import { getEffectiveFlags } from '@/lib/config/runtimeFlags';
import { packHugoContext } from '@/lib/hugo/memory/packer';
import { retrieveLongTermMemories, maybeExtractAndStoreMemories } from '@/lib/hugo/memory/longTerm';
import { getSessionSummary, maybeSummarizeSession } from '@/lib/hugo/memory/summary';
import { addMessage, listMessages } from '@/lib/hugo/memory/session';
import { MEMORY_POLICY } from '@/lib/hugo/memory/policy';
import {
  estimateDumpTokens,
  retrieveFactCards,
} from '@/lib/hugo/retrieval/search';
import { ingestDocumentText } from '@/lib/hugo/retrieval/docs';
import {
  startSpan,
  endSpan,
  recordHugoRequest,
  recordLlmCall,
  recordToolResult,
  captureException,
} from '@/lib/observability/tracing';
import { recordTokenUsage } from '@/lib/tenants/budgets';
import { getServerStoreMode } from '@/lib/storeMode';

export { hashArgs };

/** When hugoRag is on, full catalog dump is disabled unless debugDump. */
export function shouldIncludeCatalogDump(debugDump?: boolean): boolean {
  const f = getEffectiveFlags();
  return !f.hugoRag || Boolean(debugDump);
}

function isToolName(name: string): name is ToolName {
  return (TOOL_NAMES as readonly string[]).includes(name);
}

function buildContextMessage(
  input: OrchestratorInput,
  opts?: { includeDump?: boolean; retrievedFacts?: string }
): string {
  const ctx = input.databaseContext;
  const includeDump = Boolean(opts?.includeDump);
  const detailed = includeDump
    ? `### Detailed Data (JSON)\n${ctx?.jsonData || 'No data available'}`
    : `### Detailed Data\n${
        opts?.retrievedFacts ||
        '(RAG mode — use retrieved facts above and query_* tools; full dump disabled)'
      }`;

  return `
## Real-Time Firebase Database Context

### Quick Stats
- Total Materials: ${ctx?.materialsCount || 0}
- Healthy Stock: ${ctx?.healthyCount || 0}
- Low Stock: ${ctx?.lowCount || 0}
- Critical Stock: ${ctx?.criticalCount || 0}
- Pending Orders: ${ctx?.pendingOrders || 0}
- Open Sales: ${ctx?.openSales || 0}
- Suppliers: ${ctx?.supplierCount || 0}

${detailed}

---
## User Request
${input.message}${input.fileContext || ''}

Use tools for factual lookups and mutations. Prefer query_* tools before answering inventory/supplier/order questions.
For mutations, call the appropriate mutate tool (the system will ask the user to confirm).`;
}

export async function runHugoOrchestrator(
  input: OrchestratorInput,
  opts?: { storeMode?: 'firestore' | 'memory' }
): Promise<OrchestratorResponse> {
  const storeMode = opts?.storeMode || getServerStoreMode();
  const flags = getEffectiveFlags();
  recordHugoRequest();
  const span = startSpan('hugo_orchestrator', {
    requestId: input.requestId,
    tenantId: input.tenantId,
    userId: input.userId,
  });

  try {
  const meta = getFireworksProviderMeta();
  const model = createFireworksChatModel({
    maxTokens: flags.hugoMemory ? MEMORY_POLICY.maxOutputTokens : 4096,
  });
  const modelWithTools = model.bindTools(toLangChainTools());

  const messages: Array<SystemMessage | HumanMessage | AIMessage> = [
    new SystemMessage(HUGO_SYSTEM_PROMPT_V2),
  ];

  const includeDump = shouldIncludeCatalogDump(input.debugDump);
  let retrievedFacts = '';
  let ragTokens = 0;
  const dumpTokens = estimateDumpTokens(input.databaseContext?.jsonData);

  if (flags.hugoRag && !input.debugDump) {
    if (input.sessionId && input.fileContext) {
      await ingestDocumentText({
        sessionId: input.sessionId,
        text: input.fileContext,
        mode: storeMode,
      });
    }
    try {
      const retrieved = await retrieveFactCards({
        query: input.message,
        sessionId: input.sessionId,
        mode: storeMode,
        includeDocChunks: Boolean(input.sessionId && input.fileContext),
        stats: {
          materialsCount: input.databaseContext?.materialsCount,
          healthyCount: input.databaseContext?.healthyCount,
          lowCount: input.databaseContext?.lowCount,
          criticalCount: input.databaseContext?.criticalCount,
        },
      });
      retrievedFacts = retrieved.factText;
      ragTokens = retrieved.estimatedTokens;
    } catch (e) {
      logger.warn('hugo_rag_degraded', {
        requestId: input.requestId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
    logger.info('hugo_rag_vs_dump', {
      requestId: input.requestId,
      ragTokens,
      dumpTokens,
      reductionPct:
        dumpTokens > 0
          ? Math.round((1 - ragTokens / dumpTokens) * 100)
          : ragTokens === 0
            ? 100
            : 0,
    });
  }

  if (flags.hugoMemory) {
    if (input.sessionId) {
      await addMessage(
        { sessionId: input.sessionId, role: 'user', content: input.message },
        storeMode
      );
      const msgs = await listMessages(input.sessionId, storeMode);
      await maybeSummarizeSession(input.sessionId, storeMode, {
        llm: storeMode === 'firestore',
      });
      // Prefer DB history when memory enabled
      input.conversationHistory = msgs
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
    }

    const longTerm = await retrieveLongTermMemories(
      input.userId,
      input.message,
      storeMode
    );
    const summaryDoc = input.sessionId
      ? await getSessionSummary(input.sessionId, storeMode)
      : null;

    const liveFacts = includeDump
      ? `
Total Materials: ${input.databaseContext?.materialsCount || 0}
Healthy: ${input.databaseContext?.healthyCount || 0}
Low: ${input.databaseContext?.lowCount || 0}
Critical: ${input.databaseContext?.criticalCount || 0}
${input.databaseContext?.jsonData || ''}
`.trim()
      : [
          `Total Materials: ${input.databaseContext?.materialsCount || 0}`,
          `Healthy: ${input.databaseContext?.healthyCount || 0}`,
          `Low: ${input.databaseContext?.lowCount || 0}`,
          `Critical: ${input.databaseContext?.criticalCount || 0}`,
          retrievedFacts,
        ]
          .filter(Boolean)
          .join('\n');

    const packed = packHugoContext({
      longTermMemories: longTerm,
      sessionSummary: summaryDoc?.summary,
      // Exclude the just-persisted current user turn; it is sent via buildContextMessage
      conversationHistory: (input.conversationHistory || []).slice(0, -1),
      liveFacts,
      userMessage: input.message,
      fileContext: flags.hugoRag ? undefined : input.fileContext,
    });

    logger.info('hugo_context_pack', {
      requestId: input.requestId,
      estimatedTokens: packed.estimatedTokens,
      droppedVerbatimCount: packed.droppedVerbatimCount,
      packingLog: packed.packingLog,
      hugoRag: flags.hugoRag,
      includeDump,
    });

    if (packed.systemExtras) {
      messages.push(new SystemMessage(packed.systemExtras));
    }
    for (const msg of packed.recentMessages) {
      if (msg.role === 'user') messages.push(new HumanMessage(msg.content));
      else messages.push(new AIMessage(msg.content));
    }
    messages.push(
      new HumanMessage(
        `${buildContextMessage(
          { ...input, fileContext: packed.ocrTruncated || input.fileContext, conversationHistory: [] },
          { includeDump, retrievedFacts }
        )}\n\n(packing estimatedTokens=${packed.estimatedTokens}; ragTokens=${ragTokens}; dumpTokens=${dumpTokens})`
      )
    );

    await maybeExtractAndStoreMemories(
      input.userId,
      input.message,
      input.sessionId,
      storeMode
    );
  } else {
    if (input.conversationHistory?.length) {
      for (const msg of input.conversationHistory.slice(-6)) {
        if (msg.role === 'user') messages.push(new HumanMessage(msg.content));
        else messages.push(new AIMessage(msg.content));
      }
    }
    messages.push(
      new HumanMessage(
        buildContextMessage(input, { includeDump, retrievedFacts })
      )
    );
  }

  logger.info('hugo_orchestrator_start', {
    requestId: input.requestId,
    userId: input.userId,
    promptVersion: PROMPT_VERSION,
    hugoMemory: flags.hugoMemory,
    hugoRag: flags.hugoRag,
    includeDump,
  });

  const llmStarted = Date.now();
  let ai;
  try {
    ai = await modelWithTools.invoke(messages);
  } catch (e) {
    span.error = e instanceof Error ? e.message : 'llm_failed';
    await captureException(e, { requestId: input.requestId, where: 'fireworks_invoke' });
    endSpan(span, { degraded: true });
    return {
      response:
        'Hugo is temporarily unavailable (LLM outage). ERP pages still work — try again shortly or use Inventory/Materials directly.',
      model: meta.model,
      provider: meta.provider,
      promptVersion: PROMPT_VERSION,
      requestId: input.requestId,
      mode: 'tools',
    };
  }
  const llmLatency = Date.now() - llmStarted;
  const approxTokens = Math.ceil(
    messages.reduce((s, m) => s + String((m as { content?: unknown }).content || '').length, 0) / 4
  );
  recordLlmCall({ latencyMs: llmLatency, tokensIn: approxTokens, tokensOut: 400 });
  if (input.tenantId) {
    await recordTokenUsage({
      tenantId: input.tenantId,
      tokens: approxTokens + 400,
      mode: storeMode === 'memory' ? 'memory' : 'firestore',
    });
  }
  const text =
    typeof ai.content === 'string'
      ? ai.content
      : Array.isArray(ai.content)
        ? ai.content.map((c) => ('text' in c ? c.text : '')).join('')
        : String(ai.content ?? '');

  const persistAssistant = async (content: string) => {
    if (flags.hugoMemory && input.sessionId) {
      await addMessage(
        { sessionId: input.sessionId, role: 'assistant', content },
        storeMode
      );
    }
  };

  const toolCalls = ai.tool_calls || [];
  if (!toolCalls.length) {
    const response = text || 'Done.';
    await persistAssistant(response);
    endSpan(span, { toolCalls: 0 });
    return {
      response,
      model: meta.model,
      provider: meta.provider,
      promptVersion: PROMPT_VERSION,
      requestId: input.requestId,
      mode: 'tools',
    };
  }

  const limited = toolCalls.slice(0, MAX_TOOLS_PER_TURN);
  const readResults: Array<{ toolName: ToolName; result: ToolResult }> = [];
  let pendingPayload: OrchestratorResponse['pendingTool'];

  for (const call of limited) {
    const name = call.name;
    if (!isToolName(name)) continue;

    const block = assertToolNotBlocked(name, input.message);
    if (!block.ok) {
      readResults.push({
        toolName: name,
        result: { ok: false, message: block.reason },
      });
      continue;
    }

    try {
      assertToolRole(name, input.role);
    } catch (e) {
      const msg = e instanceof PolicyError ? e.message : 'Forbidden';
      readResults.push({ toolName: name, result: { ok: false, message: msg } });
      continue;
    }

    let args: Record<string, unknown>;
    try {
      args = parseToolArgs(name, call.args);
    } catch (e) {
      readResults.push({
        toolName: name,
        result: {
          ok: false,
          message: e instanceof Error ? e.message : 'Invalid tool args',
        },
      });
      continue;
    }

    if (isMutatingTool(name)) {
      if (pendingPayload) continue; // one mutate pending per turn

      const tool = getTool(name);
      const description = `${tool.description} :: ${JSON.stringify(args)}`;
      const pending = await createPendingToolCall(
        {
          userId: input.userId,
          role: input.role,
          toolName: name,
          args,
          description,
          requestId: input.requestId,
        },
        storeMode
      );

      await writeAuditLogFlexible(
        {
          requestId: input.requestId,
          userId: input.userId,
          role: input.role,
          tool: name,
          argsHash: hashArgs(args),
          status: 'proposed',
          model: meta.model,
          promptVersion: PROMPT_VERSION,
          pendingId: pending.id,
        },
        storeMode
      );

      pendingPayload = {
        pendingId: pending.id,
        toolName: name,
        args,
        description: pending.description,
        expiresAt: pending.expiresAt,
      };
      continue;
    }

    // Read tools execute immediately
    const tool = getTool(name);
    const result = await tool.execute(
      {
        userId: input.userId,
        role: input.role,
        requestId: input.requestId,
      },
      args
    );
    readResults.push({ toolName: name, result });
    recordToolResult(result.ok);
  }

  const readSummary = readResults
    .map(
      (r) =>
        `### ${r.toolName}\n${r.result.message}\n\`\`\`json\n${JSON.stringify(r.result.data ?? {}, null, 2)}\n\`\`\``
    )
    .join('\n\n');

  const responseParts = [
    text.trim(),
    readSummary ? `\n\n**Tool results**\n\n${readSummary}` : '',
    pendingPayload
      ? `\n\n🔧 **Action requires confirmation:** ${pendingPayload.description}`
      : '',
  ].filter(Boolean);

  const finalResponse = responseParts.join('\n') || 'Done.';
  await persistAssistant(finalResponse);

  endSpan(span, {
    toolCalls: limited.length,
    pending: Boolean(pendingPayload),
  });
  return {
    response: finalResponse,
    pendingTool: pendingPayload,
    readToolResults: readResults,
    model: meta.model,
    provider: meta.provider,
    promptVersion: PROMPT_VERSION,
    requestId: input.requestId,
    mode: 'tools',
  };
  } catch (e) {
    span.error = e instanceof Error ? e.message : 'orchestrator_error';
    await captureException(e, { requestId: input.requestId });
    endSpan(span);
    throw e;
  }
}

/** Test helper: map a synthetic tool call into pending payload without LLM */
export async function mapMutateCallToPending(
  input: {
    userId: string;
    role: OrchestratorInput['role'];
    requestId: string;
    toolName: ToolName;
    args: Record<string, unknown>;
    userMessage?: string;
  },
  storeMode: 'firestore' | 'memory' = 'memory'
) {
  const block = assertToolNotBlocked(input.toolName, input.userMessage || '');
  if (!block.ok) throw new PolicyError(block.reason);
  assertToolRole(input.toolName, input.role);
  const args = parseToolArgs(input.toolName, input.args);
  const pending = await createPendingToolCall(
    {
      userId: input.userId,
      role: input.role,
      toolName: input.toolName,
      args,
      description: `${input.toolName} ${JSON.stringify(args)}`,
      requestId: input.requestId,
    },
    storeMode
  );
  await writeAuditLogFlexible(
    {
      requestId: input.requestId,
      userId: input.userId,
      role: input.role,
      tool: input.toolName,
      argsHash: hashArgs(args),
      status: 'proposed',
      pendingId: pending.id,
      promptVersion: PROMPT_VERSION,
    },
    storeMode
  );
  return pending;
}
