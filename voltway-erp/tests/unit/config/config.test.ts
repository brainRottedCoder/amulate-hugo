import { afterEach, describe, expect, it } from 'vitest';
import { flags, getFireworksConfig, required } from '@/lib/config';

describe('config', () => {
  const original = process.env.FIREWORKS_API_KEY;

  afterEach(() => {
    if (original === undefined) delete process.env.FIREWORKS_API_KEY;
    else process.env.FIREWORKS_API_KEY = original;
  });

  it('required() throws when missing', () => {
    expect(() => required('FIREWORKS_API_KEY', undefined)).toThrow(
      /Missing required environment variable: FIREWORKS_API_KEY/
    );
    expect(() => required('FIREWORKS_API_KEY', '  ')).toThrow(
      /Missing required environment variable: FIREWORKS_API_KEY/
    );
  });

  it('getFireworksConfig throws when FIREWORKS_API_KEY missing', () => {
    delete process.env.FIREWORKS_API_KEY;
    expect(() => getFireworksConfig()).toThrow(/FIREWORKS_API_KEY/);
  });

  it('getFireworksConfig returns model defaults when key present', () => {
    process.env.FIREWORKS_API_KEY = 'fw_test_key';
    const cfg = getFireworksConfig();
    expect(cfg.apiKey).toBe('fw_test_key');
    expect(cfg.model).toBe('accounts/fireworks/models/minimax-m3');
    expect(cfg.baseUrl).toBe('https://api.fireworks.ai/inference/v1');
  });

  it('feature flags defaults are Phase-4 RAG on', () => {
    expect(flags.hugoEnabled).toBe(true);
    expect(flags.hugoToolCalling).toBe(process.env.HUGO_TOOL_CALLING !== 'false');
    expect(flags.hugoMemory).toBe(process.env.HUGO_MEMORY !== 'false');
    expect(flags.hugoRag).toBe(process.env.HUGO_RAG !== 'false');
  });
});
