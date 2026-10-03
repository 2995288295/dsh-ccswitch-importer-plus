// dsh-ccswitch-importer-plus — derivative of dsh-ccswitch-importer
// (Apache-2.0, https://github.com/wtiaw/dsh-ccswitch-importer).
// Changed for DSH 0.2.0-rc.2. See NOTICE and the README section
// "与上游的差异 / Differences from upstream".
import { isKnownModel } from '../../src/domain/model-catalog.mjs'

const PROBE_TIMEOUT_MS = 8000
const MAX_PROBED_MODELS = 100

/** Machine-readable probe outcomes; the UI maps these to localized text. */
export const PROBE_REASON = {
  OK: 'ok',
  EMPTY: 'empty',
  HTTP_ERROR: 'http-error',
  TIMEOUT: 'timeout',
  NETWORK: 'network',
  NO_CREDENTIALS: 'no-credentials',
  UNKNOWN: 'network',
}

export const PROBE_REASONS = new Set(Object.values(PROBE_REASON))

function joinUrl(baseURL, path) {
  return `${String(baseURL).replace(/\/+$/, '')}${path}`
}

function headersFor(profile) {
  const headers = { accept: 'application/json' }
  // OpenAI-style bearer first; anthropic relays usually accept it too.
  headers.authorization = `Bearer ${profile.apiKey}`
  if (profile.api === 'anthropic-messages') {
    // Anthropic-native upstreams list models at /v1/models with x-api-key;
    // relays vary, so keep the same OpenAI-style attempt but expect failures.
    headers['x-api-key'] = profile.apiKey
    headers['anthropic-version'] = '2023-06-01'
  }
  return headers
}

/**
 * Reach `{baseURL}/models` once and report what happened, without touching any
 * setting. Callers decide whether to merge the discovered ids (import path) or
 * only to show the outcome (the "test connection" button).
 * @param {object} profile scanned profile (needs `baseURL`; `apiKey` to authenticate)
 * @param {{ timeoutMs?: number, fetchImpl?: typeof fetch }} [options]
 * @returns {Promise<{
 *   ok: boolean, reason: string, httpStatus: number|undefined, latencyMs: number,
 *   modelIds: string[], discoveredCount: number, addedCount: number,
 *   modelCount: number, message: string,
 * }>} `ok` means the upstream answered 2xx; `message` is a Chinese fallback
 *   string, identical to the warnings `probeModels` has always produced.
 */
export async function probeConnection(profile, options = {}) {
  const startedAt = Date.now()
  const existing = new Set((profile?.models ?? []).map((model) => model.id))
  const base = {
    ok: false,
    reason: PROBE_REASON.NO_CREDENTIALS,
    httpStatus: undefined,
    latencyMs: 0,
    modelIds: [],
    discoveredCount: 0,
    addedCount: 0,
    modelCount: existing.size,
    message: '缺少 API key 或 base URL，无法测试连接',
  }
  if (profile?.apiKey === undefined || !profile?.baseURL) return base

  const timeoutMs = Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
    ? options.timeoutMs
    : PROBE_TIMEOUT_MS
  const doFetch = typeof options.fetchImpl === 'function' ? options.fetchImpl : globalThis.fetch
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await doFetch(joinUrl(profile.baseURL, '/models'), {
      headers: headersFor(profile),
      signal: controller.signal,
    })
    const latencyMs = Date.now() - startedAt
    if (!response.ok) {
      return {
        ...base,
        reason: PROBE_REASON.HTTP_ERROR,
        httpStatus: response.status,
        latencyMs,
        message: `模型探测失败（HTTP ${response.status}），保留源配置的模型列表`,
      }
    }
    const payload = await response.json()
    const ids = extractModelIds(payload)
    if (ids.length === 0) {
      return {
        ...base,
        ok: true,
        reason: PROBE_REASON.EMPTY,
        httpStatus: response.status,
        latencyMs,
        message: '模型探测返回空列表，保留源配置的模型列表',
      }
    }
    const merged = mergeModels(profile.models, ids)
    return {
      ok: true,
      reason: PROBE_REASON.OK,
      httpStatus: response.status,
      latencyMs,
      modelIds: ids,
      discoveredCount: ids.length,
      addedCount: merged.length - (profile.models?.length ?? 0),
      modelCount: merged.length,
      message: `模型探测成功：新增 ${merged.length - (profile.models?.length ?? 0)} 个模型（共 ${merged.length} 个）`,
    }
  } catch (err) {
    const reason = err?.name === 'AbortError' ? PROBE_REASON.TIMEOUT : PROBE_REASON.NETWORK
    return {
      ...base,
      reason,
      latencyMs: Date.now() - startedAt,
      message: `模型探测${reason === PROBE_REASON.TIMEOUT ? '超时' : '网络错误'}，保留源配置的模型列表`,
    }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Probe `{baseURL}/models` and merge discovered ids into the profile.
 * Only used when the user opts in (probe: true); network failures degrade to
 * a warning, never block the import.
 * @returns {Promise<{ profile, warnings }>} same profile (models possibly
 *   widened, `name` filled for known-but-unnamed ids) plus probe warnings.
 */
export async function probeModels(profile, options = {}) {
  const outcome = await probeConnection(profile, options)
  // A profile with nothing to authenticate with stays silent, as before.
  if (outcome.reason === PROBE_REASON.NO_CREDENTIALS) return { profile, warnings: [] }
  if (!outcome.ok || outcome.reason === PROBE_REASON.EMPTY) {
    return { profile, warnings: [outcome.message] }
  }
  const merged = mergeModels(profile.models, outcome.modelIds)
  return {
    profile: { ...profile, models: merged.slice(0, MAX_PROBED_MODELS) },
    warnings: [outcome.message],
  }
}

/** Widen `models` with upstream ids, naming ids the catalog already knows. */
function mergeModels(models, ids) {
  const merged = [...(models ?? [])]
  const seen = new Set(merged.map((model) => model.id))
  for (const id of ids) {
    if (seen.has(id)) continue
    seen.add(id)
    merged.push(isKnownModel(id) ? { id, name: displayNameFor(id) } : { id })
  }
  return merged
}

/** Accept OpenAI `{data:[{id}]}` and bare `[{id}]` / `{models:[...]}` shapes. */
function extractModelIds(payload) {
  const list = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.models)
        ? payload.models
        : []
  return list
    .map((entry) => (typeof entry === 'string' ? entry : entry?.id))
    .filter((id) => typeof id === 'string' && id.length > 0)
    .slice(0, MAX_PROBED_MODELS)
}

/** `claude-sonnet-4-5` → `Claude Sonnet 4.5`-style display names for known ids. */
function displayNameFor(modelId) {
  return modelId
    .split(/[-_]/)
    .map((part) => (/^\d/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(' ')
}
