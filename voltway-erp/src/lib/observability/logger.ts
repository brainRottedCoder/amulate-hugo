type LogLevel = 'info' | 'warn' | 'error' | 'debug';

type LogFields = Record<string, unknown>;

import { redactPii } from '@/lib/observability/redact';

function emit(level: LogLevel, message: string, fields: LogFields = {}) {
  const entry = {
    level,
    message,
    ts: new Date().toISOString(),
    ...(redactPii(fields) as LogFields),
  };
  const line = JSON.stringify(entry);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  info: (message: string, fields?: LogFields) => emit('info', message, fields),
  warn: (message: string, fields?: LogFields) => emit('warn', message, fields),
  error: (message: string, fields?: LogFields) => emit('error', message, fields),
  debug: (message: string, fields?: LogFields) => emit('debug', message, fields),
};

export function createRequestId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
