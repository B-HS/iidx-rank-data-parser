import { RANK_ORIGIN } from '@shared/rank-origin'
import type { RankSyncTrigger } from '@shared/rank-schema'
import { readDataset, writeRankSession, writeRankSync } from '@shared/storage'
import { createRankClient } from '@core/rank-client'
import { syncDatasetToRank } from '@core/rank-sync'
import { runState } from './run-state'

const now = () => new Date().toISOString()

const rankClient = createRankClient({ origin: RANK_ORIGIN, fetch: (input, init) => fetch(input, init) })

/**
 * Asks iidx-rank who is signed in with the browser session and stores the answer.
 * A failed request is stored with its error so it is not shown as "signed out".
 */
export const refreshRankSession = async () => {
    const result = await rankClient.getSession()

    await writeRankSession(result.ok ? { user: result.user, checkedAt: now(), error: null } : { user: null, checkedAt: now(), error: result.error })
}

/**
 * Sends the stored dataset to iidx-rank and records the outcome.
 * The lock is taken synchronously so an automatic and a manual sync cannot
 * overlap. Failures are stored as state and never thrown to the caller.
 * @param trigger - whether the sync follows a collection or a manual request
 * @returns whether the sync ran, false when another sync holds the lock
 */
export const runRankSync = async (trigger: RankSyncTrigger) => {
    if (runState.isSyncing) return false
    runState.isSyncing = true

    try {
        const { session, sync } = await syncDatasetToRank(await readDataset(), trigger, { client: rankClient, now })

        if (session !== null) await writeRankSession(session)
        await writeRankSync(sync)
    } catch {
        await writeRankSync({
            status: 'failed',
            reason: 'server_error',
            trigger,
            at: now(),
            datasetGeneratedAt: null,
            user: null,
            importId: null,
            importedAt: null,
            receivedCount: null,
            matchedCount: null,
            changedCount: null,
            unmatchedCount: null,
            unmatchedPreview: [],
            serverCode: null,
        }).catch(() => undefined)
    } finally {
        runState.isSyncing = false
    }

    return true
}

export const openRankLogin = async () => {
    await chrome.tabs.create({ url: RANK_ORIGIN, active: true })
}
