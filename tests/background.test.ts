import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { SESSION_STORAGE_KEYS, STORAGE_KEYS } from '@shared/constants'
import { BackgroundResponseSchema, OverviewSchema } from '@shared/messages'
import type { BackgroundResponse } from '@shared/messages'
import { DEFAULT_RANK_ORIGIN } from '@shared/rank-origin'
import { CollectionStateSchema } from '@shared/schema'
import type { CollectionState } from '@shared/schema'

type MessageListener = (message: unknown, sender: unknown, sendResponse: (response: unknown) => void) => boolean

type FetchCall = { input: string; init: RequestInit | undefined }

const STALE_TAB_ID = 77

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
const fetchCalls: FetchCall[] = []
const event = { addListener: () => undefined, removeListener: () => undefined }

const chromeStub = {
    runtime: { onMessage: { addListener: (listener: MessageListener) => listeners.push(listener) } },
    storage: { local: local.area, session: session.area },
    tabs: {
        create: async (options: { url?: string }) => {
            createdTabUrls.push(options.url)
            return { id: 1 }
        },
        remove: async (tabId: number) => {
            removedTabIds.push(tabId)
        },
        onUpdated: event,
        onRemoved: event,
    },
}

const send = (message: unknown) =>
    new Promise<BackgroundResponse | null>((resolve) => {
        const listener = listeners[0]
        const isHandled = listener?.(message, {}, (response) => resolve(BackgroundResponseSchema.parse(response))) ?? false

        if (!isHandled) setTimeout(() => resolve(null), 0)
    })

const overviewOf = (response: BackgroundResponse | null) => OverviewSchema.parse(response !== null && response.ok ? response.data : null)

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
        const invalid: BackgroundResponse = { ok: false, error: { key: 'error_invalid_request', params: [] } }

        expect(await send({ type: 'UNKNOWN' })).toEqual(invalid)
        expect(await send({ type: 'START_COLLECTION', settings: { style: 0, levels: [], delayProfile: 'normal' } })).toEqual(invalid)
        expect(await send({ type: 'START_COLLECTION', settings: { style: 0, levels: [12], delayProfile: 'instant' } })).toEqual(invalid)
        expect(await send({ type: 'UPDATE_SETTINGS' })).toEqual(invalid)
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

    test('저장된 데이터가 없으면 반영을 건너뛰고 서버에 요청하지 않는다', async () => {
        const overview = overviewOf(await send({ type: 'SYNC_RANK' }))

        expect(overview.rank.origin).toBe(DEFAULT_RANK_ORIGIN)
        expect(overview.rank.isSyncing).toBe(false)
        expect(overview.rank.lastSync?.status).toBe('skipped')
        expect(overview.rank.lastSync?.reason).toBe('no_data')
        expect(overview.rank.lastSync?.trigger).toBe('manual')
        expect(fetchCalls).toHaveLength(0)
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
