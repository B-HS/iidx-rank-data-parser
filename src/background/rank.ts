import { RANK_ORIGIN } from '@shared/rank-origin'
import { RANK_IMPORT_PAGE_PATH } from '@shared/rank-schema'
import type { RankHandoffPayload, RankHandoffResult, RankSyncTrigger } from '@shared/rank-schema'
import { clearRankHandoff, readDataset, readRankHandoff, readRankSync, writeRankHandoff, writeRankSession, writeRankSync } from '@shared/storage'
import { createRankClient } from '@core/rank-client'
import { isRankHandoffAlive } from '@core/rank-handoff'
import { EMPTY_RANK_SYNC_RESULT, expireRankSync, planRankSync, resolveRankSync, toRankPayload } from '@core/rank-sync'
import { runState } from './run-state'

const now = () => new Date().toISOString()

const rankClient = createRankClient({ origin: RANK_ORIGIN, fetch: (input, init) => fetch(input, init) })

/**
 * Asks iidx-rank who is signed in with the browser session and stores the answer.
 * A failed request is stored with its error so it is not shown as "signed out".
 * @returns the stored session state
 */
export const refreshRankSession = async () => {
    const result = await rankClient.getSession()
    const session = result.ok ? { user: result.user, checkedAt: now(), error: null } : { user: null, checkedAt: now(), error: result.error }

    await writeRankSession(session)

    return session
}

/**
 * Starts reflecting the stored dataset by opening the iidx-rank import page.
 * The extension does not upload anything itself. It stores a handoff, opens
 * the page in a new active tab, and leaves the sync `pending` until the page
 * reports a result. The lock is taken synchronously so an automatic and a
 * manual start cannot overlap. Failures are stored as state and never thrown.
 * @param trigger - whether the sync follows a collection or a manual request
 * @returns whether the start ran, false when another start holds the lock
 */
export const runRankSync = async (trigger: RankSyncTrigger) => {
    if (runState.isSyncing) return false
    runState.isSyncing = true

    try {
        const { session, sync } = await planRankSync(await readDataset(), trigger, { client: rankClient, now })

        const isPending = sync.status === 'pending'

        if (session !== null) await writeRankSession(session)
        if (isPending) await writeRankHandoff({ handoffId: crypto.randomUUID(), createdAt: sync.at })
        if (!isPending) await clearRankHandoff()

        await writeRankSync(sync)
        if (isPending) await chrome.tabs.create({ url: `${RANK_ORIGIN}${RANK_IMPORT_PAGE_PATH}`, active: true })
    } catch {
        await clearRankHandoff().catch(() => undefined)
        await writeRankSync({
            ...EMPTY_RANK_SYNC_RESULT,
            status: 'failed',
            reason: 'server_error',
            trigger,
            at: now(),
            datasetGeneratedAt: null,
            user: null,
        }).catch(() => undefined)
    } finally {
        runState.isSyncing = false
    }

    return true
}

/**
 * Reads the last sync state, turning a `pending` sync whose handoff is gone
 * or expired into a failure so it is never shown as in progress forever.
 */
export const reconcileRankSync = async () => {
    const stored = await readRankSync()
    if (stored === null || stored.status !== 'pending') return stored
    if (isRankHandoffAlive(await readRankHandoff(), Date.now())) return stored

    const expired = expireRankSync(stored, now())
    await writeRankSync(expired)

    return expired
}

/**
 * Builds the body for the pending handoff from the dataset stored right now.
 * @returns null when there is no live handoff or nothing that can be reflected
 */
export const getRankHandoff = async (): Promise<RankHandoffPayload | null> => {
    const handoff = await readRankHandoff()
    if (!isRankHandoffAlive(handoff, Date.now())) return null

    const payload = toRankPayload(await readDataset())

    return payload.ok ? { handoffId: handoff.handoffId, payload: payload.payload } : null
}

/**
 * Stores the result the import page reported for the pending handoff. A
 * result for any other handoff is ignored. A failure keeps the handoff until
 * it expires so the page can retry and report again, while a success removes
 * it. After a successful import the session is read again so the stored result names the
 * account the page uploaded with.
 * @param result - handoff id and outcome taken from the page's `result` message
 * @returns whether the result was accepted
 */
export const reportRankResult = async ({ handoffId, outcome }: RankHandoffResult) => {
    const handoff = await readRankHandoff()
    if (handoff === null || handoff.handoffId !== handoffId) return false

    const sync = resolveRankSync(await readRankSync(), outcome, now())
    await writeRankSync(sync)
    if (sync.status !== 'success') return true

    await clearRankHandoff()

    const session = await refreshRankSession()
    const current = await readRankSync()
    if (session.user !== null && current?.importId === sync.importId) await writeRankSync({ ...sync, user: session.user })

    return true
}

export const openRankLogin = async () => {
    await chrome.tabs.create({ url: RANK_ORIGIN, active: true })
}
