/**
 * Staging email allowlist — never email real suppliers from staging (Phase 5).
 */

export function getAppStage(): 'local' | 'staging' | 'production' {
  const raw = (process.env.VOLTWAY_ENV || process.env.STAGE || 'local').toLowerCase();
  if (raw === 'staging' || raw === 'stage') return 'staging';
  if (raw === 'production' || raw === 'prod') return 'production';
  return 'local';
}

export function getEmailAllowlist(): string[] {
  const raw = process.env.STAGING_EMAIL_ALLOWLIST || '';
  return raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function assertEmailAllowed(to: string): void {
  const stage = getAppStage();
  if (stage !== 'staging') return;
  const allow = getEmailAllowlist();
  const dest = to.trim().toLowerCase();
  if (!allow.includes(dest)) {
    const err = new Error(
      `Staging email blocked: ${to} is not on STAGING_EMAIL_ALLOWLIST. Never email real suppliers from staging.`
    );
    (err as { status?: number }).status = 403;
    throw err;
  }
}
