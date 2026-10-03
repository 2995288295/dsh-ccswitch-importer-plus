// dsh-ccswitch-importer-plus — derivative of dsh-ccswitch-importer
// (Apache-2.0, https://github.com/wtiaw/dsh-ccswitch-importer).
// Changed for DSH 0.2.0-rc.2. See NOTICE and the README section
// "与上游的差异 / Differences from upstream".
function defaultFetch(url, init) {
  return globalThis.fetch(url, init)
}

function importable(profile) {
  return profile.status !== 'blocked' && profile.credential === 'found'
}

export function createCCSwitchImportController({
  fetchImpl = defaultFetch,
  getRevision = () => undefined,
  onImported = () => {},
} = {}) {
  let snapshot = {
    phase: 'idle',
    profiles: [],
    selectedIds: [],
    results: [],
    error: null,
    source: undefined,
    probedPath: undefined,
  }
  const listeners = new Set()
  const publish = (next) => {
    snapshot = next
    for (const listener of listeners) listener()
  }
  const request = async (url, init) => {
    const response = await fetchImpl(url, init)
    let body
    try {
      body = await response.json()
    } catch {
      body = undefined
    }
    if (!response.ok) throw new Error(body?.error ?? `HTTP ${response.status}`)
    return body ?? {}
  }
  const controller = {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    setSelectedIds: (selectedIds) => {
      publish({ ...snapshot, selectedIds: [...new Set(selectedIds.filter((id) => typeof id === 'string'))] })
    },
    toggleSelected: (profileId) => {
      const selected = new Set(snapshot.selectedIds)
      if (selected.has(profileId)) selected.delete(profileId)
      else selected.add(profileId)
      controller.setSelectedIds([...selected])
    },
    selectAll: () => {
      controller.setSelectedIds(snapshot.profiles.filter(importable).map((profile) => profile.profileId))
    },
    selectNone: () => {
      controller.setSelectedIds([])
    },
    toggleSelectAll: () => {
      const importableIds = snapshot.profiles.filter(importable).map((profile) => profile.profileId)
      const allSelected = importableIds.length > 0 && importableIds.every((id) => snapshot.selectedIds.includes(id))
      if (allSelected) controller.selectNone()
      else controller.selectAll()
    },
    scan: async () => {
      publish({ ...snapshot, phase: 'loading', error: null })
      try {
        const body = await request('/api/dsh-ccswitch/scan')
        const profiles = Array.isArray(body.profiles) ? body.profiles : []
        const selectedIds = profiles.filter(importable).map((profile) => profile.profileId)
        // Carry the empty-scan reason so the UI can say *why* there is nothing
        // to import instead of showing one generic message.
        publish({
          phase: 'ready',
          profiles,
          selectedIds,
          results: [],
          error: null,
          source: typeof body.source === 'string' ? body.source : undefined,
          probedPath: typeof body.probedPath === 'string' ? body.probedPath : undefined,
        })
        return snapshot
      } catch (error) {
        publish({ ...snapshot, phase: 'error', error: error instanceof Error ? error.message : String(error) })
        throw error
      }
    },
    importSelected: async () => {
      publish({ ...snapshot, phase: 'importing', error: null })
      try {
        const body = await request('/api/dsh-ccswitch/import', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ profileIds: snapshot.selectedIds, expectedRevision: getRevision() }),
        })
        const results = Array.isArray(body.results) ? body.results : []
        publish({ ...snapshot, phase: 'done', results, error: null })
        await onImported(results)
        return snapshot
      } catch (error) {
        publish({ ...snapshot, phase: 'error', error: error instanceof Error ? error.message : String(error) })
        throw error
      }
    },
  }
  return controller
}
