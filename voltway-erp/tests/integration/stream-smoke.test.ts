import { describe, expect, it } from 'vitest';
import { GET as healthGet } from '@/app/api/health/route';

describe('stream route contract (smoke)', () => {
  it('health still public after phase 2', async () => {
    const res = await healthGet();
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.flags.hugoToolCalling).toBe(true);
  });
});
