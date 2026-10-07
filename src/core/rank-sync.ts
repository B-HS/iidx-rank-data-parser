import { RANK_IMPORT_STYLE, RANK_UNMATCHED_PREVIEW_LIMIT, RankImportSchema } from '@shared/rank-schema'
import type { RankImportOutcome, RankSessionState, RankSyncReason, RankSyncState, RankSyncTrigger } from '@shared/rank-schema'
import type { Dataset } from '@shared/schema'
import type { RankClient } from '@core/rank-client'
import { toRankImport } from '@core/rank-export'

type RankSyncDeps = {
    client: RankClient
    now: () => string
}

type RankSyncPlan = {
    session: RankSessionState | null
    sync: RankSyncState
}

type RankSyncResultFields = Omit<RankSyncState, 'status' | 'reason' | 'trigger' | 'at' | 'datasetGeneratedAt' | 'user'>

export const EMPTY_RANK_SYNC_RESULT: RankSyncResultFields = {
    importId: null,
    importedAt: null,
    receivedCount: null,
    matchedCount: null,
    changedCount: null,
    unmatchedCount: null,
    unmatchedPreview: [],
    serverCode: null,
}

const REASON_BY_RESULT_CODE = new Map<string, RankSyncReason>([
    ['AUTH_REQUIRED', 'not_logged_in'],
    ['IMPORT_COOLDOWN', 'rate_limited'],
    ['UNSUPPORTED_STYLE', 'dp_unsupported'],
    ['INVALID_INPUT', 'invalid_payload'],
    ['INVALID_PAYLOAD', 'invalid_payload'],
    ['PAYLOAD_TOO_LARGE', 'invalid_payload'],
    ['REQUEST_FAILED', 'network'],
])

/**
 * Builds the rank-import body for a stored dataset, or tells why there is none.
 * @param dataset - stored collection result, if any
 */
export const toRankPayload = (dataset: Dataset | null) => {
    if (dataset === null || dataset.charts.length === 0) return { ok: false, status: 'skipped', reason: 'no_data' } as const
    if (dataset.meta.style !== RANK_IMPORT_STYLE) return { ok: false, status: 'skipped', reason: 'dp_unsupported' } as const

    const payload = RankImportSchema.safeParse(toRankImport(dataset))
    if (!payload.success) return { ok: false, status: 'failed', reason: 'invalid_payload' } as const

    return { ok: true, payload: payload.data } as const
}

/**
 * Decides whether the iidx-rank import page should be opened for a dataset.
 * A `pending` sync means a handoff must be created and the page opened.
 * An automatic sync only starts for a signed-in session, while a manual sync
 * starts without a session check because the page guides the login itself.
 * Every outcome is returned as a state object instead of being thrown.
 * @param dataset - stored collection result, if any
 * @param trigger - whether the sync follows a collection or a manual request
 * @param deps - API client and clock
 */
export const planRankSync = async (dataset: Dataset | null, trigger: RankSyncTrigger, deps: RankSyncDeps): Promise<RankSyncPlan> => {
    const base: RankSyncState = {
        ...EMPTY_RANK_SYNC_RESULT,
        status: 'skipped',
        reason: null,
        trigger,
        at: deps.now(),
        datasetGeneratedAt: dataset?.meta.generatedAt ?? null,
        user: null,
    }

    const payload = toRankPayload(dataset)
    if (!payload.ok) return { session: null, sync: { ...base, status: payload.status, reason: payload.reason } }
    if (trigger === 'manual') return { session: null, sync: { ...base, status: 'pending' } }

    const sessionResult = await deps.client.getSession()
    if (!sessionResult.ok) {
        return {
            session: { user: null, checkedAt: deps.now(), error: sessionResult.error },
            sync: { ...base, status: 'failed', reason: sessionResult.error },
        }
    }

    const session: RankSessionState = { user: sessionResult.user, checkedAt: deps.now(), error: null }
    if (sessionResult.user === null) return { session, sync: { ...base, reason: 'not_logged_in' } }

    return { session, sync: { ...base, status: 'pending', user: sessionResult.user } }
}

/**
 * Turns the outcome reported by the import page into the last sync state.
 * A result code the extension does not know is stored as a server error, and
 * the reported code is kept for display.
 * @param previous - sync state stored when the handoff was created, if any
 * @param outcome - outcome validated from the page's `result` message
 * @param at - time the result was received
 */
export const resolveRankSync = (previous: RankSyncState | null, outcome: RankImportOutcome, at: string): RankSyncState => {
    const base: RankSyncState = {
        ...EMPTY_RANK_SYNC_RESULT,
        status: 'failed',
        reason: null,
        trigger: previous?.trigger ?? 'manual',
        at,
        datasetGeneratedAt: previous?.datasetGeneratedAt ?? null,
        user: previous?.user ?? null,
    }

    if (outcome.status === 'failed') return { ...base, reason: REASON_BY_RESULT_CODE.get(outcome.code) ?? 'server_error', serverCode: outcome.code }

    return {
        ...base,
        status: 'success',
        importId: outcome.result.importId,
        importedAt: outcome.result.importedAt,
        receivedCount: outcome.result.receivedCount,
        matchedCount: outcome.result.matchedCount,
        changedCount: outcome.result.changedCount,
        unmatchedCount: outcome.result.unmatched.length,
        unmatchedPreview: outcome.result.unmatched.slice(0, RANK_UNMATCHED_PREVIEW_LIMIT),
    }
}

/**
 * Marks a pending sync as failed because its handoff is gone or expired.
 * @param pending - sync state still waiting for the page's result
 * @param at - time the expiry was noticed
 */
export const expireRankSync = (pending: RankSyncState, at: string): RankSyncState => ({ ...pending, status: 'failed', reason: 'handoff_expired', at })
