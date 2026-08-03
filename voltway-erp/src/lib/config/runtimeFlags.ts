/**
 * Runtime feature-flag overrides (admin console). Env defaults + memory overlay.
 */

import type { FeatureFlags } from '@/lib/config';
import { flags as envFlags } from '@/lib/config';

let overrides: Partial<FeatureFlags> = {};

export function resetFlagOverrides(): void {
  overrides = {};
}

export function getEffectiveFlags(): FeatureFlags {
  return { ...envFlags, ...overrides };
}

export function setFlagOverrides(partial: Partial<FeatureFlags>): FeatureFlags {
  overrides = { ...overrides, ...partial };
  return getEffectiveFlags();
}

export function getFlagOverrides(): Partial<FeatureFlags> {
  return { ...overrides };
}
