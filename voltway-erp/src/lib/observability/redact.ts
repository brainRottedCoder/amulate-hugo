/**
 * PII redaction for logs (Phase 5).
 */

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_RE = /(?:\+?\d{1,3}[\s\-.]?)?(?:\(?\d{3}\)?[\s\-.]?)?\d{3}[\s\-.]?\d{4}\b/g;
const BEARER_RE = /Bearer\s+[A-Za-z0-9._\-]+/gi;

export function redactPii(value: unknown): unknown {
  if (typeof value === 'string') {
    return value
      .replace(EMAIL_RE, '[REDACTED_EMAIL]')
      .replace(PHONE_RE, '[REDACTED_PHONE]')
      .replace(BEARER_RE, 'Bearer [REDACTED_TOKEN]');
  }
  if (Array.isArray(value)) return value.map(redactPii);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const key = k.toLowerCase();
      if (
        key === 'password' ||
        key === 'secret' ||
        key === 'apikey' ||
        key === 'api_key' ||
        key === 'authorization' ||
        key === 'idtoken' ||
        key === 'id_token' ||
        key === 'accesstoken' ||
        key === 'refresh_token' ||
        key === 'email' ||
        key === 'phone' ||
        key === 'phonenumber'
      ) {
        out[k] = '[REDACTED]';
      } else {
        out[k] = redactPii(v);
      }
    }
    return out;
  }
  return value;
}
