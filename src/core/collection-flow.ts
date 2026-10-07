import { RADAR_AXES } from '@shared/domain'
import type { DifficultyPageOutcome } from '@shared/domain'
import type { CollectionState, DifficultyPage, NotesRadar } from '@shared/schema'

type DifficultyPageSignals = Pick<DifficultyPage, 'rowCount' | 'hasTable' | 'isNoData' | 'requiresLogin'>

/**
 * Decides how the level traversal continues after one difficulty page.
 * A page without a table and without the "no data" notice is treated as an
 * unexpected page (maintenance, error) instead of the end of the level.
 * @param page - signals parsed from the page
 * @param pageSize - number of song rows a full page holds
 */
export const classifyDifficultyPage = (page: DifficultyPageSignals, pageSize: number): DifficultyPageOutcome => {
    if (page.requiresLogin) return 'login_required'
    if (page.isNoData) return 'end'
    if (!page.hasTable) return 'unexpected_page'

    return page.rowCount < pageSize ? 'end' : 'next'
}

/**
 * Tells whether a stored running collection stopped reporting progress.
 * @param state - stored collection state
 * @param now - current time in epoch milliseconds
 * @param staleMs - allowed silence before the run counts as dead
 */
export const isCollectionStale = (state: Pick<CollectionState, 'status' | 'updatedAt' | 'startedAt'>, now: number, staleMs: number) => {
    if (state.status !== 'running') return false

    const lastSeen = state.updatedAt ?? state.startedAt
    if (lastSeen === null) return true

    return now - Date.parse(lastSeen) > staleMs
}

export const hasRadarValues = (radar: NotesRadar | null): radar is NotesRadar =>
    radar !== null && RADAR_AXES.some((axis) => (radar.values[axis] ?? null) !== null)

/**
 * Picks the notes radar to store from candidates in priority order.
 * A candidate matched by axis label wins over one inferred by order, and a
 * candidate without any value is only kept when nothing better exists.
 * @param candidates - radars in priority order
 */
export const pickNotesRadar = (candidates: Array<NotesRadar | null>) =>
    candidates.find((radar) => hasRadarValues(radar) && radar.matchedByLabel) ??
    candidates.find((radar) => hasRadarValues(radar)) ??
    candidates.find((radar) => radar !== null) ??
    null
