import { describe, expect, it } from 'vitest';
import { packHugoContext } from '@/lib/hugo/memory/packer';
import {
  MEMORY_POLICY,
  assertMemoryOwner,
  shouldTriggerSummary,
  truncateOcr,
} from '@/lib/hugo/memory/policy';

describe('memory packer', () => {
  it('keeps recent N + summary under budget', () => {
    const history = Array.from({ length: 40 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `msg ${i} ${'x'.repeat(20)}`,
    }));

    const packed = packHugoContext({
      sessionSummary: 'Earlier: user prefers supplier ACME for batteries.',
      conversationHistory: history,
      userMessage: 'What was my battery preference?',
      budgetTokens: 50_000,
    });

    expect(packed.recentMessages.length).toBeLessThanOrEqual(MEMORY_POLICY.recentMessages);
    expect(packed.systemExtras).toMatch(/Session summary/);
    expect(packed.estimatedTokens).toBeLessThanOrEqual(50_000);
    expect(packed.packingLog.some((l) => l.startsWith('estimated_tokens='))).toBe(true);
  });

  it('drops oldest verbatim first when over budget', () => {
    const history = Array.from({ length: 16 }, (_, i) => ({
      role: 'user' as const,
      content: `OLD_${i}_` + 'z'.repeat(4000),
    }));

    const packed = packHugoContext({
      sessionSummary: 'keep me',
      conversationHistory: history,
      userMessage: 'hi',
      budgetTokens: 2_000,
    });

    expect(packed.droppedVerbatimCount).toBeGreaterThan(0);
    expect(packed.packingLog).toContain('drop_oldest_verbatim');
    expect(packed.systemExtras).toMatch(/keep me/);
    if (packed.recentMessages.length > 0) {
      expect(packed.recentMessages[0].content).not.toMatch(/^OLD_0_/);
    }
  });
});

describe('summary trigger thresholds', () => {
  it('triggers only above summaryTriggerMessages', () => {
    expect(shouldTriggerSummary(MEMORY_POLICY.summaryTriggerMessages)).toBe(false);
    expect(shouldTriggerSummary(MEMORY_POLICY.summaryTriggerMessages + 1)).toBe(true);
    expect(shouldTriggerSummary(10)).toBe(false);
  });
});

describe('memory ownership helpers', () => {
  it('allows owner and admin; rejects other user', () => {
    expect(() => assertMemoryOwner('u1', 'u1')).not.toThrow();
    expect(() => assertMemoryOwner('u1', 'admin', true)).not.toThrow();
    expect(() => assertMemoryOwner('u1', 'u2')).toThrow(/Forbidden/);
  });
});

describe('OCR truncation', () => {
  it('respects maxOcrChars and appends notice', () => {
    const big = 'A'.repeat(MEMORY_POLICY.maxOcrChars + 500);
    const { text, truncated } = truncateOcr(big);
    expect(truncated).toBe(true);
    expect(text.length).toBeGreaterThan(MEMORY_POLICY.maxOcrChars);
    expect(text).toMatch(/OCR truncated/);
    expect(text.startsWith('A'.repeat(100))).toBe(true);

    const small = truncateOcr('short');
    expect(small.truncated).toBe(false);
    expect(small.text).toBe('short');
  });
});
