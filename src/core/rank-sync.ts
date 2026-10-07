import { RANK_IMPORT_STYLE, RANK_UNMATCHED_PREVIEW_LIMIT, RankImportSchema } from '@shared/rank-schema'
import type { RankSessionState, RankSyncReason, RankSyncState, RankSyncTrigger } from '@shared/rank-schema'
import type { Dataset } from '@shared/schema'
import type { RankClient } from '@core/rank-client'
import { toRankImport } from '@core/rank-export'

type RankSyncDeps = {
    client: RankClient
    now: () => string
}

type RankSyncOutcome = {
    session: RankSessionState | null
    sync: RankSyncState
}

/**
 * Reflects a stored dataset to the signed-in iidx-rank account.
 * The session is checked right before sending. Nothing is sent for DP data,
 * an empty dataset, or a missing session, and every outcome is returned as a
 * state object instead of being thrown.
 * @param dataset - stored collection result, if any
 * @param trigger - whether the sync follows a collection or a manual request
 * @param deps - API client and clock
 */
export const syncDatasetToRank = async (dataset: Dataset | null, trigger: RankSyncTrigger, deps: RankSyncDeps): Promise<RankSyncOutcome> => {
    const base: RankSyncState = {
        status: 'skipped',
        reason: null,
        trigger,
        at: deps.now(),
        datasetGeneratedAt: dataset?.meta.generatedAt ?? null,
        user: null,
        importId: null,
        importedAt: null,
        receivedCount: null,
        matchedCount: null,
        changedCount: null,
        unmatchedCount: null,
        unmatchedPreview: [],
        serverCode: null,
    }
    const skipped = (reason: RankSyncReason): RankSyncState => ({ ...base, status: 'skipped', reason })
    const failed = (reason: RankSyncReason, serverCode: string | null = null): RankSyncState => ({ ...base, status: 'failed', reason, serverCode })

    if (dataset === null || dataset.charts.length === 0) return { session: null, sync: skipped('no_data') }
    if (dataset.meta.style !== RANK_IMPORT_STYLE) return { session: null, sync: skipped('dp_unsupported') }

    const sessionResult = await deps.client.getSession()
    if (!sessionResult.ok) return { session: { user: null, checkedAt: deps.now(), error: sessionResult.error }, sync: failed(sessionResult.error) }

    const session: RankSessionState = { user: sessionResult.user, checkedAt: deps.now(), error: null }
    if (sessionResult.user === null) return { session, sync: skipped('not_logged_in') }

    const payload = RankImportSchema.safeParse(toRankImport(dataset))
    if (!payload.success) return { session, sync: { ...failed('invalid_payload'), user: sessionResult.user } }

    const result = await deps.client.importRecords(payload.data)
    if (!result.ok) return { session, sync: { ...failed(result.reason, result.serverCode), user: sessionResult.user } }

    return {
        session,
        sync: {
            ...base,
            status: 'success',
            user: sessionResult.user,
            importId: result.data.importId,
            importedAt: result.data.importedAt,
            receivedCount: result.data.receivedCount,
            matchedCount: result.data.matchedCount,
            changedCount: result.data.changedCount,
            unmatchedCount: result.data.unmatched.length,
            unmatchedPreview: result.data.unmatched.slice(0, RANK_UNMATCHED_PREVIEW_LIMIT),
        },
    }
}
