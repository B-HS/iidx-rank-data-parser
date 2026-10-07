import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { SESSION_STORAGE_KEYS, STORAGE_KEYS } from '@shared/constants'
import { BackgroundResponseSchema, OverviewSchema, RankHandoffReplySchema } from '@shared/messages'
import type { BackgroundResponse } from '@shared/messages'
import { DEFAULT_RANK_ORIGIN } from '@shared/rank-origin'
import { RANK_HANDOFF_TTL_MS, RankHandoffSchema, RankImportSchema, RankSyncStateSchema } from '@shared/rank-schema'
import { CollectionStateSchema } from '@shared/schema'
import type { CollectionState } from '@shared/schema'
import { buildDataset } from './support/dataset'

type MessageListener = (message: unknown, sender: unknown, sendResponse: (response: unknown) => void) => boolean

type FetchCall = { input: string; init: RequestInit | undefined }

const STALE_TAB_ID = 77
const EXTENSION_ID = 'test-extension-id'
const IMPORT_URL = `${DEFAULT_RANK_ORIGIN}/import`
const RANK_TAB_SENDER = { id: EXTENSION_ID, url: IMPORT_URL, origin: DEFAULT_RANK_ORIGIN, frameId: 0, tab: { id: 5 } }
const INVALID_REQUEST: BackgroundResponse = { ok: false, error: { key: 'error_invalid_request', params: [] } }

const interruptedRun: CollectionState = {
    status: 'running',
    runId: 'dead-run',
    phase: 'charts',
    message: { key: 'progress_charts', params: ['12', '3', '100'] },
    percent: 40,
    startedAt: '2026-10-07T09:00:00.000Z',
    updatedAt: '2026-10-07T09:01:00.000Z',
    finishedAt: null,
    error: null,
    warnings: [],
    chartCount: 100,
    pagesFetched: 2,
    datasetStatus: null,
}

const createArea = (initial: Record<string, unknown>) => {
    const values = new Map(Object.entries(initial))

    return {
        values,
        area: {
            get: async (key: string) => (values.has(key) ? { [key]: values.get(key) } : {}),
            set: async (items: Record<string, unknown>) => {
                for (const [key, value] of Object.entries(items)) values.set(key, value)
            },
            remove: async (keys: string | string[]) => {
                for (const key of [keys].flat()) values.delete(key)
            },
        },
    }
}

const local = createArea({ [STORAGE_KEYS.collection]: interruptedRun, 'iidx:dataset:v1': { legacy: true } })
const session = createArea({ [SESSION_STORAGE_KEYS.collectionTabId]: STALE_TAB_ID })
const listeners: MessageListener[] = []
const removedTabIds: number[] = []
const createdTabUrls: Array<string | undefined> = []
const activeTabFlags: Array<boolean | undefined> = []
const fetchCalls: FetchCall[] = []
const event = { addListener: () => undefined, removeListener: () => undefined }

const chromeStub = {
    runtime: { id: EXTENSION_ID, onMessage: { addListener: (listener: MessageListener) => listeners.push(listener) } },
    storage: { local: local.area, session: session.area },
    tabs: {
        create: async (options: { url?: string; active?: boolean }) => {
            createdTabUrls.push(options.url)
            activeTabFlags.push(options.active)
            return { id: 1 }
        },
        remove: async (tabId: number) => {
            removedTabIds.push(tabId)
        },
        onUpdated: event,
        onRemoved: event,
    },
}

const send = (message: unknown, sender: unknown = {}) =>
    new Promise<BackgroundResponse | null>((resolve) => {
        const listener = listeners[0]
        const isHandled = listener?.(message, sender, (response) => resolve(BackgroundResponseSchema.parse(response))) ?? false

        if (!isHandled) setTimeout(() => resolve(null), 0)
    })

const overviewOf = (response: BackgroundResponse | null) => OverviewSchema.parse(response !== null && response.ok ? response.data : null)

const handoffOf = (response: BackgroundResponse | null) =>
    RankHandoffReplySchema.parse(response !== null && response.ok ? response.data : null).handoff

const storedHandoff = () => RankHandoffSchema.parse(session.values.get(SESSION_STORAGE_KEYS.rankHandoff))

const storedSync = () => RankSyncStateSchema.parse(local.values.get(STORAGE_KEYS.rankSync))

const successOutcome = {
    status: 'success',
    result: {
        importId: 12,
        channel: 'extension',
        importedAt: '2026-10-07T10:06:01.000Z',
        receivedCount: 1,
        matchedCount: 1,
        changedCount: 1,
        unmatched: [{ title: '곡명', difficulty: 'A' }],
        changes: [{ chartId: 'chart-6d4d8c5dd256f3870c3527063b541f01', previousLamp: null, lamp: 'HARD', scoreGrade: 'AA', exScore: 3000 }],
    },
}

const originalFetch = globalThis.fetch

afterAll(() => {
    Object.assign(globalThis, { fetch: originalFetch })
})

beforeAll(async () => {
    Object.assign(globalThis, {
        chrome: chromeStub,
        fetch: async (input: string, init?: RequestInit) => {
            fetchCalls.push({ input, init })
            return Response.json({ success: true, data: { user: { id: 'u1', name: 'DJ', handle: null } } })
        },
    })
    await import('../src/background/index')
})

describe('background', () => {
    test('service worker가 중단되어 running으로 남은 수집을 실패로 되돌리고 남은 탭을 닫는다', async () => {
        const overview = overviewOf(await send({ type: 'GET_OVERVIEW' }))
        const stored = CollectionStateSchema.parse(local.values.get(STORAGE_KEYS.collection))

        expect(overview.collection.status).toBe('failed')
        expect(overview.collection.error).toEqual({ key: 'error_interrupted', params: [] })
        expect(overview.collection.finishedAt).not.toBeNull()
        expect(stored.status).toBe('failed')
        expect(removedTabIds).toEqual([STALE_TAB_ID])
        expect(session.values.has(SESSION_STORAGE_KEYS.collectionTabId)).toBe(false)
    })

    test('이전 버전의 저장 값을 지운다', () => {
        expect(local.values.has('iidx:dataset:v1')).toBe(false)
    })

    test('모르는 요청과 잘못된 설정은 검증에서 거부한다', async () => {
        expect(await send({ type: 'UNKNOWN' })).toEqual(INVALID_REQUEST)
        expect(await send({ type: 'START_COLLECTION', settings: { style: 0, levels: [], delayProfile: 'normal' } })).toEqual(INVALID_REQUEST)
        expect(await send({ type: 'START_COLLECTION', settings: { style: 0, levels: [12], delayProfile: 'instant' } })).toEqual(INVALID_REQUEST)
        expect(await send({ type: 'UPDATE_SETTINGS' })).toEqual(INVALID_REQUEST)
        expect(await send({ type: 'REPORT_RANK_RESULT', handoffId: 'x', outcome: { status: 'done' } }, RANK_TAB_SENDER)).toEqual(INVALID_REQUEST)
        expect(createdTabUrls).toEqual([])
    })

    test('type이 없는 메시지는 처리하지 않는다', async () => {
        expect(await send({ hello: 'world' })).toBeNull()
        expect(await send('text')).toBeNull()
    })

    test('저장된 데이터가 없으면 내보내기를 거부한다', async () => {
        const missing: BackgroundResponse = { ok: false, error: { key: 'error_no_dataset', params: [] } }

        expect(await send({ type: 'EXPORT_DATASET' })).toEqual(missing)
        expect(await send({ type: 'EXPORT_RANK_IMPORT' })).toEqual(missing)
    })

    test('저장된 데이터가 없으면 반영을 건너뛰고 가져오기 화면을 열지 않는다', async () => {
        const overview = overviewOf(await send({ type: 'SYNC_RANK' }))

        expect(overview.rank.origin).toBe(DEFAULT_RANK_ORIGIN)
        expect(overview.rank.isSyncing).toBe(false)
        expect(overview.rank.lastSync?.status).toBe('skipped')
        expect(overview.rank.lastSync?.reason).toBe('no_data')
        expect(overview.rank.lastSync?.trigger).toBe('manual')
        expect(fetchCalls).toHaveLength(0)
        expect(createdTabUrls).toEqual([])
        expect(session.values.has(SESSION_STORAGE_KEYS.rankHandoff)).toBe(false)
        expect(handoffOf(await send({ type: 'GET_RANK_HANDOFF' }, RANK_TAB_SENDER))).toBeNull()
    })

    test('세션 확인은 쿠키를 붙여 요청하고 사용자만 저장한다', async () => {
        const overview = overviewOf(await send({ type: 'CHECK_RANK_SESSION' }))

        expect(fetchCalls).toHaveLength(1)
        expect(fetchCalls[0]?.input).toBe(`${DEFAULT_RANK_ORIGIN}/api/extension/session`)
        expect(fetchCalls[0]?.init?.credentials).toBe('include')
        expect(overview.rank.session?.user).toEqual({ id: 'u1', name: 'DJ', handle: null })
        expect(overview.rank.session?.error).toBeNull()
        expect(Object.keys(overview.rank.session ?? {}).toSorted()).toEqual(['checkedAt', 'error', 'user'])
    })

    test('로그인 페이지 열기는 iidx-rank 출처를 새 탭으로 연다', async () => {
        expect(await send({ type: 'OPEN_RANK_LOGIN' })).toEqual({ ok: true, data: null })
        expect(createdTabUrls).toEqual([DEFAULT_RANK_ORIGIN])
    })

    test('진행 중인 수집이 없을 때의 중단 요청은 오류 없이 끝난다', async () => {
        expect(await send({ type: 'CANCEL_COLLECTION' })).toEqual({ ok: true, data: null })
    })
})

describe('background rank handoff', () => {
    test('수동 반영은 세션 확인 없이 handoff를 만들고 가져오기 화면을 새 활성 탭으로 연다', async () => {
        local.values.set(STORAGE_KEYS.dataset, await buildDataset())
        createdTabUrls.length = 0
        activeTabFlags.length = 0
        const fetchCount = fetchCalls.length

        const overview = overviewOf(await send({ type: 'SYNC_RANK' }))
        const handoff = storedHandoff()

        expect(createdTabUrls).toEqual([IMPORT_URL])
        expect(activeTabFlags).toEqual([true])
        expect(fetchCalls).toHaveLength(fetchCount)
        expect(overview.rank.lastSync?.status).toBe('pending')
        expect(overview.rank.lastSync?.trigger).toBe('manual')
        expect(overview.rank.lastSync?.reason).toBeNull()
        expect(overview.rank.isSyncing).toBe(false)
        expect(handoff.createdAt).toBe(overview.rank.lastSync?.at ?? '')
        expect(Object.keys(session.values.get(SESSION_STORAGE_KEYS.rankHandoff) ?? {}).toSorted()).toEqual(['createdAt', 'handoffId'])
    })

    test('handoff 조회와 결과 보고는 iidx-rank 탭의 content script에서 온 것만 처리한다', async () => {
        const report = { type: 'REPORT_RANK_RESULT', handoffId: storedHandoff().handoffId, outcome: successOutcome }
        const senders = [
            {},
            { id: EXTENSION_ID, url: `chrome-extension://${EXTENSION_ID}/popup/index.html` },
            { ...RANK_TAB_SENDER, url: 'https://p.eagate.573.jp/game/2dx/34/index.html', origin: 'https://p.eagate.573.jp' },
            { ...RANK_TAB_SENDER, frameId: 2 },
            { ...RANK_TAB_SENDER, id: 'another-extension' },
        ]

        for (const sender of senders) {
            expect(await send({ type: 'GET_RANK_HANDOFF' }, sender)).toEqual(INVALID_REQUEST)
            expect(await send(report, sender)).toEqual(INVALID_REQUEST)
        }

        expect(storedSync().status).toBe('pending')
        expect(session.values.has(SESSION_STORAGE_KEYS.rankHandoff)).toBe(true)
    })

    test('handoff 조회는 저장된 데이터로 본문을 만들어 돌려주고 결과 전까지 반복해서 돌려준다', async () => {
        const first = handoffOf(await send({ type: 'GET_RANK_HANDOFF' }, RANK_TAB_SENDER))
        const second = handoffOf(await send({ type: 'GET_RANK_HANDOFF' }, RANK_TAB_SENDER))

        expect(first?.handoffId).toBe(storedHandoff().handoffId)
        expect(RankImportSchema.safeParse(first?.payload).success).toBe(true)
        expect(first?.payload.charts).toHaveLength(1)
        expect(second).toEqual(first)
    })

    test('대기 중인 것과 다른 handoffId의 결과는 무시한다', async () => {
        expect(await send({ type: 'REPORT_RANK_RESULT', handoffId: 'another-handoff', outcome: successOutcome }, RANK_TAB_SENDER)).toEqual({
            ok: true,
            data: null,
        })

        expect(storedSync().status).toBe('pending')
        expect(session.values.has(SESSION_STORAGE_KEYS.rankHandoff)).toBe(true)
    })

    test('성공 결과를 마지막 반영 상태로 저장하고 handoff를 지운다', async () => {
        const { handoffId } = storedHandoff()
        const fetchCount = fetchCalls.length

        expect(await send({ type: 'REPORT_RANK_RESULT', handoffId, outcome: successOutcome }, RANK_TAB_SENDER)).toEqual({ ok: true, data: null })

        const sync = storedSync()

        expect(sync.status).toBe('success')
        expect(sync.trigger).toBe('manual')
        expect(sync.importId).toBe(12)
        expect(sync.receivedCount).toBe(1)
        expect(sync.matchedCount).toBe(1)
        expect(sync.changedCount).toBe(1)
        expect(sync.unmatchedCount).toBe(1)
        expect(sync.unmatchedPreview).toEqual([{ title: '곡명', difficulty: 'A' }])
        expect(sync.user).toEqual({ id: 'u1', name: 'DJ', handle: null })
        expect(fetchCalls).toHaveLength(fetchCount + 1)
        expect(fetchCalls.at(-1)?.input).toBe(`${DEFAULT_RANK_ORIGIN}/api/extension/session`)
        expect(JSON.stringify(local.values.get(STORAGE_KEYS.rankSync))).not.toContain('changes')
        expect(session.values.has(SESSION_STORAGE_KEYS.rankHandoff)).toBe(false)
        expect(handoffOf(await send({ type: 'GET_RANK_HANDOFF' }, RANK_TAB_SENDER))).toBeNull()
    })

    test('이미 처리한 handoff의 결과가 다시 와도 상태를 바꾸지 않는다', async () => {
        const before = storedSync()

        await send(
            { type: 'REPORT_RANK_RESULT', handoffId: 'another-handoff', outcome: { status: 'failed', code: 'AUTH_REQUIRED' } },
            RANK_TAB_SENDER,
        )

        expect(storedSync()).toEqual(before)
    })

    test('화면이 보고한 실패 코드를 사유로 바꿔 저장한다', async () => {
        overviewOf(await send({ type: 'SYNC_RANK' }))
        const { handoffId } = storedHandoff()

        await send({ type: 'REPORT_RANK_RESULT', handoffId, outcome: { status: 'failed', code: 'IMPORT_COOLDOWN' } }, RANK_TAB_SENDER)

        const sync = storedSync()

        expect(sync.status).toBe('failed')
        expect(sync.reason).toBe('rate_limited')
        expect(sync.serverCode).toBe('IMPORT_COOLDOWN')
        expect(sync.trigger).toBe('manual')
        expect(session.values.has(SESSION_STORAGE_KEYS.rankHandoff)).toBe(true)
    })

    test('실패를 보고한 뒤 같은 handoff의 다시 시도 성공을 받아 저장하고 handoff를 지운다', async () => {
        overviewOf(await send({ type: 'SYNC_RANK' }))
        const { handoffId } = storedHandoff()

        await send({ type: 'REPORT_RANK_RESULT', handoffId, outcome: { status: 'failed', code: 'IMPORT_COOLDOWN' } }, RANK_TAB_SENDER)
        await send({ type: 'REPORT_RANK_RESULT', handoffId, outcome: successOutcome }, RANK_TAB_SENDER)

        expect(storedSync().status).toBe('success')
        expect(session.values.has(SESSION_STORAGE_KEYS.rankHandoff)).toBe(false)
    })

    test('만료된 handoff는 넘기지 않고 진행 중 상태를 만료로 바꾼다', async () => {
        overviewOf(await send({ type: 'SYNC_RANK' }))
        const handoff = storedHandoff()

        expect(overviewOf(await send({ type: 'GET_OVERVIEW' })).rank.lastSync?.status).toBe('pending')

        session.values.set(SESSION_STORAGE_KEYS.rankHandoff, {
            ...handoff,
            createdAt: new Date(Date.parse(handoff.createdAt) - RANK_HANDOFF_TTL_MS).toISOString(),
        })

        expect(handoffOf(await send({ type: 'GET_RANK_HANDOFF' }, RANK_TAB_SENDER))).toBeNull()

        const overview = overviewOf(await send({ type: 'GET_OVERVIEW' }))

        expect(overview.rank.lastSync?.status).toBe('failed')
        expect(overview.rank.lastSync?.reason).toBe('handoff_expired')
        expect(storedSync().reason).toBe('handoff_expired')
    })

    test('handoff가 사라진 진행 중 상태도 만료로 바꾼다', async () => {
        overviewOf(await send({ type: 'SYNC_RANK' }))
        session.values.delete(SESSION_STORAGE_KEYS.rankHandoff)

        const overview = overviewOf(await send({ type: 'GET_OVERVIEW' }))

        expect(overview.rank.lastSync?.status).toBe('failed')
        expect(overview.rank.lastSync?.reason).toBe('handoff_expired')
    })

    test('DP 데이터로 바뀌면 대기 중인 handoff가 있어도 본문을 넘기지 않는다', async () => {
        overviewOf(await send({ type: 'SYNC_RANK' }))
        local.values.set(STORAGE_KEYS.dataset, await buildDataset({ style: 1 }))

        expect(session.values.has(SESSION_STORAGE_KEYS.rankHandoff)).toBe(true)
        expect(handoffOf(await send({ type: 'GET_RANK_HANDOFF' }, RANK_TAB_SENDER))).toBeNull()

        const overview = overviewOf(await send({ type: 'SYNC_RANK' }))

        expect(overview.rank.lastSync?.status).toBe('skipped')
        expect(overview.rank.lastSync?.reason).toBe('dp_unsupported')
        expect(session.values.has(SESSION_STORAGE_KEYS.rankHandoff)).toBe(false)
    })

    test('저장 데이터를 지우면 handoff와 반영 상태도 함께 지운다', async () => {
        local.values.set(STORAGE_KEYS.dataset, await buildDataset())
        overviewOf(await send({ type: 'SYNC_RANK' }))

        const overview = overviewOf(await send({ type: 'CLEAR_DATA' }))

        expect(overview.dataset).toBeNull()
        expect(overview.rank.lastSync).toBeNull()
        expect(session.values.has(SESSION_STORAGE_KEYS.rankHandoff)).toBe(false)
    })
})
