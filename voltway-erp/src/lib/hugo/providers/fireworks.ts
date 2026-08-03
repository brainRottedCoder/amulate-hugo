/**
 * Sole LLM provider adapter for Hugo (Phase 1).
 * Fireworks OpenAI-compatible API + MiniMax M3.
 * Docs: https://docs.fireworks.ai/getting-started/quickstart
 */

import { ChatOpenAI } from '@langchain/openai';
import { getFireworksConfig } from '@/lib/config';

export function createFireworksChatModel(overrides?: {
  temperature?: number;
  maxTokens?: number;
}) {
  const config = getFireworksConfig();

  return new ChatOpenAI({
    apiKey: config.apiKey,
    modelName: config.model,
    temperature: overrides?.temperature ?? config.temperature,
    maxTokens: overrides?.maxTokens ?? config.maxTokens,
    configuration: {
      baseURL: config.baseUrl,
    },
  });
}

export function getFireworksProviderMeta() {
  const config = getFireworksConfig();
  return {
    model: config.model,
    provider: 'Fireworks + LangChain',
  };
}
