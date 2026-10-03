// dsh-ccswitch-importer-plus — derivative of dsh-ccswitch-importer
// (Apache-2.0, https://github.com/wtiaw/dsh-ccswitch-importer).
// Changed for DSH 0.2.0-rc.2. See NOTICE and the README section
// "与上游的差异 / Differences from upstream".
import { discoverSources, scanSource, defaultSourcePath, SCAN_REASON } from '../../lib/core/scan.js'
import { classifyProfiles } from '../../lib/core/mapper.js'
import { importProfiles as runImport } from '../../lib/core/importer.js'
import { probeModels } from '../../lib/core/probe.js'
import { redactText } from '../../lib/core/safety.js'

export const API_BASE = '/api/dsh-ccswitch'
const MAX_JSON_BODY_BYTES = 64 * 1024
const SAFE_STATUSES = new Set(['new', 'update', 'updated', 'unchanged', 'blocked', 'failed', 'skipped'])
const SAFE_REASONING = new Set(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'])
const SAFE_SCAN_REASONS = new Set(Object.values(SCAN_REASON))

export function isLoopbackRequest(request) {
  const address = request.socket?.remoteAddress
  if (address !== '127.0.0.1' && address !== '::1' && address !== '::ffff:127.0.0.1') return false
  const host = request.headers?.host
  if (typeof host !== 'string') return false
  let hostUrl
  try { hostUrl = new URL(`http://${host}`) } catch { return false }
  if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(hostUrl.hostname)) return false
  if (request.headers?.['sec-fetch-site'] === 'cross-site') return false
  const origin = request.headers?.origin
  if (origin === undefined) return true
  try { return new URL(origin).host === hostUrl.host } catch { return false }
}

function publicText(value) {
  return typeof value === 'string' ? value.slice(0, 200) : undefined
}

function publicEndpoint(value) {
  if (typeof value !== 'string') return undefined
  try {
    const url = new URL(value)
    return `${url.origin}${url.pathname}`
  } catch {
    return undefined
  }
}

function publicWarning(value) {
  const text = String(value ?? '')
  if (text.includes('requires_openai_auth')) return 'provider requires OpenAI authentication'
  if (text.includes('没有 model')) return 'model is missing from the source profile'
  if (text.startsWith('unknown reasoning effort')) return 'unknown reasoning effort; configure it in DSH'
  if (text.startsWith('reasoning effort')) return 'reasoning effort is outside the conservative catalog'
  if (text.includes('已保留模型')) return 'existing model reasoning settings were preserved'
  if (text.includes('已保留现有 route')) return 'existing route reasoning was preserved'
  if (text.includes('provider 键') || text.includes('同名 provider')) return 'provider key collision; existing provider was preserved'
  return 'source profile contains an import warning'
}

function publicWarnings(value) {
  return Array.isArray(value) ? value.slice(0, 20).map(publicWarning) : []
}

/**
 * Loopback-only API: surface the real failure reason, but never a credential.
 *
 * Shape matching alone is not enough — a relay key that does not start with
 * `sk-` would sail through — so the caller passes the concrete secrets for the
 * profile that failed and `redactText` removes them by value.
 */
function publicErrorDetail(value, secrets = []) {
  return redactText(value, secrets) || 'import failed'
}

function publicSummary(summary) {
  return {
    profileId: publicText(summary.profileId),
    profileName: publicText(summary.profileName),
    sourceLabel: 'CCSwitch',
    providerKey: publicText(summary.providerKey),
    baseURL: publicEndpoint(summary.baseURL),
    api: publicText(summary.api),
    modelCount: Number.isInteger(summary.modelCount) ? summary.modelCount : 0,
    modelIds: Array.isArray(summary.modelIds) ? summary.modelIds.filter((id) => typeof id === 'string').slice(0, 100) : [],
    credential: summary.credential === 'found' ? 'found' : 'missing',
    reasoningEffort: SAFE_REASONING.has(summary.reasoningEffort) ? summary.reasoningEffort : undefined,
    status: SAFE_STATUSES.has(summary.status) ? summary.status : 'blocked',
    warnings: publicWarnings(summary.warnings),
    blockedReason: summary.blockedReason ? 'source profile is blocked' : undefined,
  }
}

function publicResult(result, secrets = []) {
  const status = SAFE_STATUSES.has(result?.status) ? result.status : 'failed'
  const output = {
    profileId: publicText(result?.profileId),
    profileName: publicText(result?.profileName),
    providerKey: publicText(result?.providerKey),
    status,
    warnings: publicWarnings(result?.warnings),
  }
  if (status === 'failed') output.error = publicErrorDetail(result?.error, secrets)
  if (status === 'blocked') output.error = 'profile blocked'
  if (status === 'skipped') output.skipReason = 'profile was not selected or is not importable'
  return output
}

export function writeJson(response, status, body) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
  })
  response.end(JSON.stringify(body))
}

export async function readJsonBody(request) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > MAX_JSON_BODY_BYTES) {
      // Stop reading and tear the connection down: leaving the rest of an
      // oversized body in the socket would desync the next request on it.
      request.destroy?.()
      return undefined
    }
    chunks.push(buffer)
  }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

function defaultScan() {
  const sources = discoverSources()
  if (sources.length === 0) {
    return { profiles: [], reason: SCAN_REASON.NOT_INSTALLED, dbPath: defaultSourcePath() }
  }
  return scanSource(sources[0])
}

function normalizeScanResult(scanned) {
  if (Array.isArray(scanned)) return { profiles: scanned, reason: undefined, dbPath: undefined }
  return {
    profiles: Array.isArray(scanned?.profiles) ? scanned.profiles : [],
    reason: scanned?.reason,
    dbPath: scanned?.dbPath,
  }
}

function methodFence(request, response, isLoopback, method, { requireOrigin = false } = {}) {
  if (!isLoopback(request)) {
    writeJson(response, 403, { error: 'forbidden: loopback and same-origin only' })
    return false
  }
  if (request.method !== method) {
    writeJson(response, 405, { error: 'method not allowed' })
    return false
  }
  // A missing Origin is tolerated for reads (curl, CLI, same-origin fetches),
  // but a state-changing request must prove it came from a real page origin.
  if (requireOrigin && typeof request.headers?.origin !== 'string') {
    writeJson(response, 403, { error: 'forbidden: missing Origin on a state-changing request' })
    return false
  }
  return true
}

export function makeRoutes(deps = {}) {
  const scan = deps.scan ?? defaultScan
  const getProviders = deps.getProviders ?? (async () => ({}))
  const importProfiles = deps.importProfiles ?? runImport
  const isLoopback = deps.isLoopback ?? isLoopbackRequest
  const settings = deps.settings
  const credentials = deps.credentials
  return [
    {
      kind: 'exact',
      path: `${API_BASE}/scan`,
      handler: async (request, response) => {
        if (!methodFence(request, response, isLoopback, 'GET')) return
        try {
          const { profiles, reason, dbPath } = normalizeScanResult(await scan())
          const classified = classifyProfiles(profiles, await getProviders())
          const body = { profiles: classified.map((item) => publicSummary(item.summary)) }
          if (SAFE_SCAN_REASONS.has(reason)) {
            body.source = reason
            // Only useful when we looked somewhere and found nothing.
            if (reason === SCAN_REASON.NOT_INSTALLED) body.probedPath = publicText(dbPath)
          }
          writeJson(response, 200, body)
        } catch {
          writeJson(response, 500, { error: 'scan failed' })
        }
      },
    },
    {
      kind: 'exact',
      path: `${API_BASE}/import`,
      handler: async (request, response) => {
        if (!methodFence(request, response, isLoopback, 'POST', { requireOrigin: true })) return
        const body = await readJsonBody(request)
        if (!body || !Array.isArray(body.profileIds) || body.profileIds.some((id) => typeof id !== 'string')) {
          writeJson(response, 400, { error: 'body must be { profileIds: string[], expectedRevision?: number, probe?: boolean }' })
          return
        }
        if (body.expectedRevision !== undefined && (typeof body.expectedRevision !== 'number' || !Number.isInteger(body.expectedRevision))) {
          writeJson(response, 400, { error: 'expectedRevision must be an integer' })
          return
        }
        let knownSecrets = []
        try {
          let profiles = normalizeScanResult(await scan()).profiles
          // Opt-in model discovery: only probe profiles the user selected,
          // so a slow/unreachable relay never delays the plain import path.
          if (body.probe === true) {
            const selected = new Set(body.profileIds)
            const probed = await Promise.all(
              profiles
                .filter((profile) => !profile.skipped && !profile.blocked && selected.has(profile.profileId))
                .map((profile) => probeModels(profile)),
            )
            const probedById = new Map(probed.map((entry) => [entry.profile.profileId, entry]))
            profiles = profiles.map((profile) => {
              const entry = probedById.get(profile.profileId)
              return entry ? { ...profile, models: entry.profile.models, warnings: [...(profile.warnings ?? []), ...entry.warnings] } : profile
            })
          }
          const secretByProfileId = new Map()
          for (const profile of profiles) {
            if (typeof profile.apiKey === 'string' && profile.apiKey.length > 0) {
              secretByProfileId.set(profile.profileId, profile.apiKey)
            }
          }
          knownSecrets = [...secretByProfileId.values()]
          const results = await importProfiles({
            profiles,
            selectedIds: body.profileIds,
            settings,
            credentials,
            expectedRevision: body.expectedRevision,
          })
          writeJson(response, 200, { results: results.map((result) => publicResult(result, knownSecretsFor(result, secretByProfileId))) })
        } catch (err) {
          // Never log the raw error object: it can carry request bodies and
          // credentials straight past every redactor in this file.
          const label = err instanceof Error ? err.name : typeof err
          console.error('[dsh-ccswitch-importer-plus] import failed:', `${label}: ${redactText(err, knownSecrets)}`)
          writeJson(response, 500, { error: 'import failed' })
        }
      },
    },
  ]
}

function knownSecretsFor(result, secretByProfileId) {
  const own = secretByProfileId.get(result?.profileId)
  return typeof own === 'string' ? [own] : []
}
