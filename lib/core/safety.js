// dsh-ccswitch-importer-plus — derivative of dsh-ccswitch-importer
// (Apache-2.0, https://github.com/wtiaw/dsh-ccswitch-importer).
// Changed for DSH 0.2.0-rc.2. See NOTICE and the README section
// "与上游的差异 / Differences from upstream".
/**
 * Shared safety helpers: settings-conflict identification and credential
 * redaction. Both the Host core and the route layer import from here so a
 * single definition governs every place an error can reach the browser.
 */

/**
 * The Host settings service throws `SETTINGS_CONFLICT`; the 0.2.0 remote API
 * surface reports the same condition as `settings/conflict`. Both mean "the
 * document moved under you", so both must be recognised.
 */
export const HOST_SETTINGS_CONFLICT_CODE = 'SETTINGS_CONFLICT'
export const REMOTE_SETTINGS_CONFLICT_CODE = 'settings/conflict'

export function isSettingsConflict(error) {
  if (!error) return false
  const code = typeof error?.code === 'string' ? error.code : ''
  if (code === HOST_SETTINGS_CONFLICT_CODE || code === REMOTE_SETTINGS_CONFLICT_CODE) return true
  if (/conflict/i.test(code)) return true
  const message = error instanceof Error ? error.message : String(error?.message ?? error ?? '')
  return /conflict/i.test(message)
}

/** Machine-readable failure kinds. The Host maps these to fixed messages. */
export const IMPORT_FAILURE = {
  CREDENTIAL: 'credential-write-failed',
  SETTINGS: 'settings-write-failed',
  CONFLICT: 'settings-conflict',
  ROLLBACK: 'credential-rollback-failed',
}

/**
 * Redact a free-form error before it can leave the Host process.
 *
 * Two layers, because shape matching alone is not enough: a relay key that does
 * not start with `sk-` still has to be removed. The caller passes the concrete
 * secrets it knows about, and a length heuristic catches anything else that
 * looks like a long opaque token.
 */
export function redactText(value, secrets = []) {
  let text = value instanceof Error ? value.message : String(value?.message ?? value ?? '')
  for (const secret of secrets) {
    if (typeof secret === 'string' && secret.length >= 8) {
      text = text.split(secret).join('[redacted]')
    }
  }
  return text
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, 'sk-[redacted]')
    .replace(/\b(?:authorization|x-api-key|api-key)\b[^\n]*/gi, 'auth header [redacted]')
    .replace(/[A-Za-z0-9_\-]{32,}/g, '[redacted]')
    .slice(0, 300)
}
