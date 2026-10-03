// dsh-ccswitch-importer-plus — derivative of dsh-ccswitch-importer
// (Apache-2.0, https://github.com/wtiaw/dsh-ccswitch-importer).
// Changed for DSH 0.2.0-rc.2. See NOTICE and the README section
// "与上游的差异 / Differences from upstream".
import { isKnownModel } from '../../src/domain/model-catalog.mjs'

const PROBE_TIMEOUT_MS = 8000
const MAX_PROBED_MODELS = 100

function joinUrl(baseURL, path) {
  return `${String(baseURL).replace(/\/+$/, '')}${path}`
}

/**
 * Probe `{baseURL}/models` and merge discovered ids into the profile.
 * Only used when the user opts in (probe: true); network failures degrade to
 * a warning, never block the import.
 * @returns {Promise<{ profile, warnings }>} same profile (models possibly
 *   widened, `name` filled for known-but-unnamed ids) plus probe warnings.
 */
export async function probeModels(profile) {
  const warnings = []
  if (profile.apiKey === undefined || !profile.baseURL) return { profile, warnings }
  if (profile.api === 'anthropic-messages') {
    // Anthropic-native upstreams list models at /v1/models with x-api-key;
    // relays vary, so keep the same OpenAI-style attempt but expect failures.
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
  try {
    const headers = { accept: 'application/json' }
    // OpenAI-style bearer first; anthropic relays usually accept it too.
    headers.authorization = `Bearer ${profile.apiKey}`
    if (profile.api === 'anthropic-messages') {
      headers['x-api-key'] = profile.apiKey
      headers['anthropic-version'] = '2023-06-01'
    }
    const url = joinUrl(profile.baseURL, '/models')
    const response = await fetch(url, { headers, signal: controller.signal })
    if (!response.ok) {
      warnings.push(`模型探测失败（HTTP ${response.status}），保留源配置的模型列表`)
      return { profile, warnings }
    }
    const payload = await response.json()
    const ids = extractModelIds(payload)
    if (ids.length === 0) {
      warnings.push('模型探测返回空列表，保留源配置的模型列表')
      return { profile, warnings }
    }
    const existing = new Set((profile.models ?? []).map((model) => model.id))
    const merged = [...(profile.models ?? [])]
    for (const id of ids) {
      if (existing.has(id)) continue
      existing.add(id)
      merged.push(isKnownModel(id) ? { id, name: displayNameFor(id) } : { id })
    }
    warnings.push(`模型探测成功：新增 ${merged.length - (profile.models?.length ?? 0)} 个模型（共 ${merged.length} 个）`)
    return { profile: { ...profile, models: merged.slice(0, MAX_PROBED_MODELS) }, warnings }
  } catch (err) {
    const reason = err?.name === 'AbortError' ? '超时' : '网络错误'
    warnings.push(`模型探测${reason}，保留源配置的模型列表`)
    return { profile, warnings }
  } finally {
    clearTimeout(timer)
  }
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
