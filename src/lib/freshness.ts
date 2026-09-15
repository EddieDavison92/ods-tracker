// Syncs run every 6 hours; older than two missed runs means the sync is probably failing.
const STALE_AFTER_MS = 13 * 3_600_000

export const isStale = (iso: string | null | undefined): boolean => !iso || Date.now() - Date.parse(iso) > STALE_AFTER_MS
