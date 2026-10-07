import { describe, expect, test } from 'bun:test'
import { DATASET_FORMAT, DATASET_SCHEMA_VERSION, GAME_VERSION } from '@shared/constants'
import { RANK_UNMATCHED_PREVIEW_LIMIT, RankSyncStateSchema } from '@shared/rank-schema'
import type { RankImport } from '@shared/rank-schema'
import { DatasetSchema } from '@shared/schema'
import type { Dataset } from '@shared/schema'
import { chartIdFrom } from '@core/chart-id'
import type { RankClient } from '@core/rank-client'
import { syncDatasetToRank } from '@core/rank-sync'

type SessionResult = Awaited<ReturnType<RankClient['getSession']>>
type ImportOutcome = Awaited<ReturnType<RankClient['importRecords']>>

const NOW = '2026-10-07T10:06:00.000Z'
const USER = { id: 'u1', name: 'DJ', handle: 'dj' }

const buildDataset = async (overrides: { style?: 0 | 1; chartCount?: number } = {}): Promise<Dataset> => {
    const style = overrides.style ?? 0
    const chart = {
        chartId: await chartIdFrom('冥', 'A'),
        title: '冥',
        difficultyName: 'ANOTHER',
        difficulty: 'A',
        level: 12,
        style,
        djLevel: 'AAA',
        exScore: 3123,
        pgreat: 1500,
        great: 123,
        missCount: null,
        lamp: 'FULL_COMBO',
    }

    return DatasetSchema.parse({
        format: DATASET_FORMAT,
        schemaVersion: DATASET_SCHEMA_VERSION,
        gameVersion: GAME_VERSION,
        player: null,
        notesRadar: null,
        charts: (overrides.chartCount ?? 1) === 0 ? [] : [chart],
        meta: {
            status: 'complete',
            generatedAt: '2026-10-07T10:05:00.000Z',
            finishedAt: '2026-10-07T10:05:00.000Z',
            gameVersion: GAME_VERSION,
            style,
            levels: [12],
            delay: { minMs: 500, maxMs: 1100 },
            pagesFetched: 1,
            failedLevels: [],
            warnings: [],
        },
    })
}

const depsWith = (session: SessionResult, outcome: ImportOutcome) => {
    const calls: { sessions: number; imports: RankImport[] } = { sessions: 0, imports: [] }
    const client: RankClient = {
        getSession: async () => {
            calls.sessions += 1
            return session
        },
        importRecords: async (payload) => {
            calls.imports.push(payload)
            return outcome
        },
    }

    return { calls, deps: { client, now: () => NOW } }
}

const success: ImportOutcome = {
    ok: true,
    data: {
        importId: 12,
        channel: 'extension',
        importedAt: '2026-10-07T10:06:01.000Z',
        receivedCount: 1,
        matchedCount: 1,
        changedCount: 1,
        unmatched: Array.from({ length: RANK_UNMATCHED_PREVIEW_LIMIT + 2 }, (_, index) => ({ title: `곡 ${index}`, difficulty: 'A' })),
    },
}

describe('syncDatasetToRank', () => {
    test('SP 데이터와 세션이 있으면 전송하고 결과를 기록한다', async () => {
        const { calls, deps } = depsWith({ ok: true, user: USER }, success)
        const { session, sync } = await syncDatasetToRank(await buildDataset(), 'auto', deps)

        expect(calls.sessions).toBe(1)
        expect(calls.imports).toHaveLength(1)
        expect(calls.imports[0]?.version).toBe(2)
        expect(session).toEqual({ user: USER, checkedAt: NOW, error: null })
        expect(RankSyncStateSchema.safeParse(sync).success).toBe(true)
        expect(sync.status).toBe('success')
        expect(sync.reason).toBeNull()
        expect(sync.trigger).toBe('auto')
        expect(sync.user).toEqual(USER)
        expect(sync.receivedCount).toBe(1)
        expect(sync.matchedCount).toBe(1)
        expect(sync.changedCount).toBe(1)
        expect(sync.unmatchedCount).toBe(RANK_UNMATCHED_PREVIEW_LIMIT + 2)
        expect(sync.unmatchedPreview).toHaveLength(RANK_UNMATCHED_PREVIEW_LIMIT)
        expect(sync.unmatchedPreview[0]).toEqual({ title: '곡 0', difficulty: 'A' })
        expect(sync.datasetGeneratedAt).toBe('2026-10-07T10:05:00.000Z')
    })

    test('데이터가 없으면 세션 확인 없이 건너뛴다', async () => {
        const { calls, deps } = depsWith({ ok: true, user: USER }, success)
        const none = await syncDatasetToRank(null, 'manual', deps)
        const empty = await syncDatasetToRank(await buildDataset({ chartCount: 0 }), 'manual', deps)

        expect(none.sync.status).toBe('skipped')
        expect(none.sync.reason).toBe('no_data')
        expect(none.session).toBeNull()
        expect(empty.sync.reason).toBe('no_data')
        expect(calls.sessions).toBe(0)
        expect(calls.imports).toHaveLength(0)
    })

    test('DP 데이터는 보내지 않고 건너뛴다', async () => {
        const { calls, deps } = depsWith({ ok: true, user: USER }, success)
        const { sync } = await syncDatasetToRank(await buildDataset({ style: 1 }), 'auto', deps)

        expect(sync.status).toBe('skipped')
        expect(sync.reason).toBe('dp_unsupported')
        expect(calls.sessions).toBe(0)
        expect(calls.imports).toHaveLength(0)
    })

    test('로그인되어 있지 않으면 보내지 않고 건너뛴다', async () => {
        const { calls, deps } = depsWith({ ok: true, user: null }, success)
        const { session, sync } = await syncDatasetToRank(await buildDataset(), 'auto', deps)

        expect(sync.status).toBe('skipped')
        expect(sync.reason).toBe('not_logged_in')
        expect(session).toEqual({ user: null, checkedAt: NOW, error: null })
        expect(calls.imports).toHaveLength(0)
    })

    test('세션 확인 실패는 비로그인이 아니라 실패로 기록한다', async () => {
        const { calls, deps } = depsWith({ ok: false, error: 'network' }, success)
        const { session, sync } = await syncDatasetToRank(await buildDataset(), 'auto', deps)

        expect(sync.status).toBe('failed')
        expect(sync.reason).toBe('network')
        expect(session?.error).toBe('network')
        expect(calls.imports).toHaveLength(0)
    })

    test('서버가 거부하면 사유 코드와 서버 코드를 기록한다', async () => {
        const { deps } = depsWith({ ok: true, user: USER }, { ok: false, reason: 'origin_rejected', serverCode: 'ORIGIN_NOT_ALLOWED' })
        const { sync } = await syncDatasetToRank(await buildDataset(), 'manual', deps)

        expect(sync.status).toBe('failed')
        expect(sync.reason).toBe('origin_rejected')
        expect(sync.serverCode).toBe('ORIGIN_NOT_ALLOWED')
        expect(sync.user).toEqual(USER)
        expect(sync.receivedCount).toBeNull()
    })
})
