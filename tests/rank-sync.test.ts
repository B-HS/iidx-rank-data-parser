import { describe, expect, test } from 'bun:test'
import { RANK_UNMATCHED_PREVIEW_LIMIT, RankImportOutcomeSchema, RankImportSchema, RankSyncStateSchema } from '@shared/rank-schema'
import type { RankImportOutcome, RankSyncState } from '@shared/rank-schema'
import type { RankClient } from '@core/rank-client'
import { expireRankSync, planRankSync, resolveRankSync, toRankPayload } from '@core/rank-sync'
import { DATASET_GENERATED_AT, buildDataset } from './support/dataset'

type SessionResult = Awaited<ReturnType<RankClient['getSession']>>

const NOW = '2026-10-07T10:06:00.000Z'
const LATER = '2026-10-07T10:07:00.000Z'
const USER = { id: 'u1', name: 'DJ', handle: 'dj' }

const depsWith = (session: SessionResult) => {
    const calls = { sessions: 0 }
    const client: RankClient = {
        getSession: async () => {
            calls.sessions += 1
            return session
        },
    }

    return { calls, deps: { client, now: () => NOW } }
}

const pendingSync = async (trigger: RankSyncState['trigger']) =>
    (await planRankSync(await buildDataset(), trigger, depsWith({ ok: true, user: USER }).deps)).sync

const importResult = {
    importId: 12,
    channel: 'extension',
    importedAt: '2026-10-07T10:06:01.000Z',
    receivedCount: 1,
    matchedCount: 1,
    changedCount: 1,
    unmatched: Array.from({ length: RANK_UNMATCHED_PREVIEW_LIMIT + 2 }, (_, index) => ({ title: `곡 ${index}`, difficulty: 'A' })),
} as const

const success: RankImportOutcome = { status: 'success', result: importResult }

describe('toRankPayload', () => {
    test('SP 데이터는 rank-import v2 본문으로 만든다', async () => {
        const result = toRankPayload(await buildDataset())

        expect(result.ok).toBe(true)
        expect(RankImportSchema.safeParse(result.ok ? result.payload : null).success).toBe(true)
    })

    test('데이터가 없거나 DP면 본문을 만들지 않고 사유를 돌려준다', async () => {
        expect(toRankPayload(null)).toEqual({ ok: false, status: 'skipped', reason: 'no_data' })
        expect(toRankPayload(await buildDataset({ chartCount: 0 }))).toEqual({ ok: false, status: 'skipped', reason: 'no_data' })
        expect(toRankPayload(await buildDataset({ style: 1 }))).toEqual({ ok: false, status: 'skipped', reason: 'dp_unsupported' })
    })

    test('계약에 맞지 않는 본문은 실패로 돌려준다', async () => {
        const dataset = await buildDataset()

        expect(toRankPayload({ ...dataset, gameVersion: 0 })).toEqual({ ok: false, status: 'failed', reason: 'invalid_payload' })
    })
})

describe('planRankSync', () => {
    test('자동 반영은 SP 데이터와 세션 사용자가 있으면 진행 중 상태로 시작한다', async () => {
        const { calls, deps } = depsWith({ ok: true, user: USER })
        const { session, sync } = await planRankSync(await buildDataset(), 'auto', deps)

        expect(calls.sessions).toBe(1)
        expect(session).toEqual({ user: USER, checkedAt: NOW, error: null })
        expect(RankSyncStateSchema.safeParse(sync).success).toBe(true)
        expect(sync.status).toBe('pending')
        expect(sync.reason).toBeNull()
        expect(sync.trigger).toBe('auto')
        expect(sync.at).toBe(NOW)
        expect(sync.user).toEqual(USER)
        expect(sync.receivedCount).toBeNull()
        expect(sync.datasetGeneratedAt).toBe(DATASET_GENERATED_AT)
    })

    test('수동 반영은 세션을 확인하지 않고 진행 중 상태로 시작한다', async () => {
        const { calls, deps } = depsWith({ ok: true, user: null })
        const { session, sync } = await planRankSync(await buildDataset(), 'manual', deps)

        expect(calls.sessions).toBe(0)
        expect(session).toBeNull()
        expect(sync.status).toBe('pending')
        expect(sync.trigger).toBe('manual')
        expect(sync.user).toBeNull()
    })

    test('데이터가 없으면 세션 확인 없이 건너뛴다', async () => {
        const { calls, deps } = depsWith({ ok: true, user: USER })
        const none = await planRankSync(null, 'manual', deps)
        const empty = await planRankSync(await buildDataset({ chartCount: 0 }), 'auto', deps)

        expect(none.sync.status).toBe('skipped')
        expect(none.sync.reason).toBe('no_data')
        expect(none.session).toBeNull()
        expect(empty.sync.status).toBe('skipped')
        expect(empty.sync.reason).toBe('no_data')
        expect(calls.sessions).toBe(0)
    })

    test('DP 데이터는 자동과 수동 모두 건너뛴다', async () => {
        const { calls, deps } = depsWith({ ok: true, user: USER })
        const auto = await planRankSync(await buildDataset({ style: 1 }), 'auto', deps)
        const manual = await planRankSync(await buildDataset({ style: 1 }), 'manual', deps)

        expect(auto.sync.status).toBe('skipped')
        expect(auto.sync.reason).toBe('dp_unsupported')
        expect(manual.sync.status).toBe('skipped')
        expect(manual.sync.reason).toBe('dp_unsupported')
        expect(calls.sessions).toBe(0)
    })

    test('자동 반영은 로그인되어 있지 않으면 시작하지 않고 건너뛴다', async () => {
        const { deps } = depsWith({ ok: true, user: null })
        const { session, sync } = await planRankSync(await buildDataset(), 'auto', deps)

        expect(sync.status).toBe('skipped')
        expect(sync.reason).toBe('not_logged_in')
        expect(session).toEqual({ user: null, checkedAt: NOW, error: null })
    })

    test('자동 반영의 세션 확인 실패는 비로그인이 아니라 실패로 기록한다', async () => {
        const { deps } = depsWith({ ok: false, error: 'network' })
        const { session, sync } = await planRankSync(await buildDataset(), 'auto', deps)

        expect(sync.status).toBe('failed')
        expect(sync.reason).toBe('network')
        expect(session?.error).toBe('network')
    })
})

describe('resolveRankSync', () => {
    test('성공 결과의 건수와 일치하지 않은 곡을 기록하고 시작할 때의 방식과 계정을 유지한다', async () => {
        const sync = resolveRankSync(await pendingSync('auto'), success, LATER)

        expect(RankSyncStateSchema.safeParse(sync).success).toBe(true)
        expect(sync.status).toBe('success')
        expect(sync.reason).toBeNull()
        expect(sync.trigger).toBe('auto')
        expect(sync.at).toBe(LATER)
        expect(sync.user).toEqual(USER)
        expect(sync.importId).toBe(12)
        expect(sync.importedAt).toBe('2026-10-07T10:06:01.000Z')
        expect(sync.receivedCount).toBe(1)
        expect(sync.matchedCount).toBe(1)
        expect(sync.changedCount).toBe(1)
        expect(sync.unmatchedCount).toBe(RANK_UNMATCHED_PREVIEW_LIMIT + 2)
        expect(sync.unmatchedPreview).toHaveLength(RANK_UNMATCHED_PREVIEW_LIMIT)
        expect(sync.unmatchedPreview[0]).toEqual({ title: '곡 0', difficulty: 'A' })
        expect(sync.datasetGeneratedAt).toBe(DATASET_GENERATED_AT)
        expect(sync.serverCode).toBeNull()
    })

    test('응답에 changes가 있어도 받아들이고 상태에는 저장하지 않는다', async () => {
        const withChanges = RankImportOutcomeSchema.parse({
            status: 'success',
            result: {
                ...importResult,
                changes: [{ chartId: 'chart-6d4d8c5dd256f3870c3527063b541f01', previousLamp: null, lamp: 'HARD', scoreGrade: 'AA', exScore: 3000 }],
            },
        })
        const sync = resolveRankSync(await pendingSync('manual'), withChanges, LATER)

        expect(sync.status).toBe('success')
        expect(JSON.stringify(sync)).not.toContain('changes')
        expect(RankSyncStateSchema.strict().safeParse(sync).success).toBe(true)
    })

    test('화면이 보고한 실패 코드를 반영 사유로 바꾸고 코드를 남긴다', async () => {
        const pending = await pendingSync('manual')
        const reasonOf = (code: string) => {
            const sync = resolveRankSync(pending, { status: 'failed', code }, LATER)
            return { status: sync.status, reason: sync.reason, serverCode: sync.serverCode }
        }

        expect(reasonOf('AUTH_REQUIRED')).toEqual({ status: 'failed', reason: 'not_logged_in', serverCode: 'AUTH_REQUIRED' })
        expect(reasonOf('IMPORT_COOLDOWN')).toEqual({ status: 'failed', reason: 'rate_limited', serverCode: 'IMPORT_COOLDOWN' })
        expect(reasonOf('UNSUPPORTED_STYLE')).toEqual({ status: 'failed', reason: 'dp_unsupported', serverCode: 'UNSUPPORTED_STYLE' })
        expect(reasonOf('INVALID_INPUT')).toEqual({ status: 'failed', reason: 'invalid_payload', serverCode: 'INVALID_INPUT' })
        expect(reasonOf('INVALID_PAYLOAD')).toEqual({ status: 'failed', reason: 'invalid_payload', serverCode: 'INVALID_PAYLOAD' })
        expect(reasonOf('PAYLOAD_TOO_LARGE')).toEqual({ status: 'failed', reason: 'invalid_payload', serverCode: 'PAYLOAD_TOO_LARGE' })
        expect(reasonOf('REQUEST_FAILED')).toEqual({ status: 'failed', reason: 'network', serverCode: 'REQUEST_FAILED' })
        expect(reasonOf('ORIGIN_NOT_ALLOWED')).toEqual({ status: 'failed', reason: 'server_error', serverCode: 'ORIGIN_NOT_ALLOWED' })
        expect(reasonOf('INTERNAL_ERROR')).toEqual({ status: 'failed', reason: 'server_error', serverCode: 'INTERNAL_ERROR' })
    })

    test('시작 상태가 남아 있지 않아도 결과를 수동 반영으로 기록한다', () => {
        const sync = resolveRankSync(null, success, LATER)

        expect(RankSyncStateSchema.safeParse(sync).success).toBe(true)
        expect(sync.status).toBe('success')
        expect(sync.trigger).toBe('manual')
        expect(sync.user).toBeNull()
    })
})

describe('expireRankSync', () => {
    test('진행 중 상태를 만료 사유의 실패로 바꾼다', async () => {
        const expired = expireRankSync(await pendingSync('auto'), LATER)

        expect(RankSyncStateSchema.safeParse(expired).success).toBe(true)
        expect(expired.status).toBe('failed')
        expect(expired.reason).toBe('handoff_expired')
        expect(expired.trigger).toBe('auto')
        expect(expired.at).toBe(LATER)
    })
})
