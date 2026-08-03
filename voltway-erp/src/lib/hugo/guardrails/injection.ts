import type { ToolName } from '@/types/hugo';

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+instructions/i,
  /disregard\s+(all\s+)?(previous|prior)\s+instructions/i,
  /you\s+are\s+now\s+(dan|unrestricted|jailbroken)/i,
  /system\s*prompt\s*:/i,
];

const DESTRUCTIVE_PHRASES = [
  /delete\s+all/i,
  /drop\s+(the\s+)?(database|collection)/i,
  /wipe\s+(all\s+)?(data|materials|inventory)/i,
  /remove\s+everything/i,
];

export function detectPromptInjection(text: string): boolean {
  return INJECTION_PATTERNS.some((p) => p.test(text));
}

export function detectDestructiveEscalation(text: string): boolean {
  return DESTRUCTIVE_PHRASES.some((p) => p.test(text));
}

/**
 * Soft guard: injection / wipe-all language must not escalate to delete_record.
 * Returns blocked tool names.
 */
export function blockedToolsForUserText(text: string): ToolName[] {
  const blocked: ToolName[] = [];
  if (detectPromptInjection(text) || detectDestructiveEscalation(text)) {
    blocked.push('delete_record');
  }
  return blocked;
}

export function assertToolNotBlocked(
  toolName: ToolName,
  userText: string
): { ok: true } | { ok: false; reason: string } {
  const blocked = blockedToolsForUserText(userText);
  if (blocked.includes(toolName)) {
    return {
      ok: false,
      reason:
        'Refusing destructive/injection-escalated tool call. Rephrase without override instructions.',
    };
  }
  return { ok: true };
}
