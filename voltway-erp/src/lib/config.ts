/**
 * Typed app config + feature flags (Phase 1).
 * Never import getFireworksConfig() from client components — it requires server secrets.
 */

export type FeatureFlags = {
  hugoEnabled: boolean;
  hugoToolCalling: boolean;
  hugoMemory: boolean;
  hugoRag: boolean;
};

export const flags: FeatureFlags = {
  hugoEnabled: true,
  hugoToolCalling: process.env.HUGO_TOOL_CALLING !== 'false',
  hugoMemory: process.env.HUGO_MEMORY !== 'false',
  hugoRag: process.env.HUGO_RAG !== 'false',
};

export const APP_VERSION = '0.5.0-phase5';

export function required(name: string, value: string | undefined): string {
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getFireworksConfig() {
  return {
    apiKey: required('FIREWORKS_API_KEY', process.env.FIREWORKS_API_KEY),
    model:
      process.env.FIREWORKS_MODEL || 'accounts/fireworks/models/minimax-m3',
    baseUrl:
      process.env.FIREWORKS_BASE_URL || 'https://api.fireworks.ai/inference/v1',
    temperature: 0.2,
    maxTokens: 16384,
  };
}

export function getFirebasePublicConfig() {
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '',
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '',
  };
}

export const RATE_LIMIT = {
  perUserPerMinute: 20,
  perIpPerMinute: 60,
  windowMs: 60_000,
} as const;

/** Cookie set client-side so the proxy can soft-gate ERP pages */
export const AUTH_COOKIE_NAME = 'voltway_auth';
