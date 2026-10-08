import { afterAll, describe, expect, test } from 'bun:test'
import { EAGATE_URLS, SESSION_STORAGE_KEYS, STORAGE_KEYS } from '@shared/constants'
import { ExtractRequestSchema } from '@shared/messages'
import type { ExtractResponse } from '@shared/messages'
import { CollectionStateSchema, DatasetSchema } from '@shared/schema'
import type { ParsedChart, Settings } from '@shared/schema'
import { runCollection } from '../src/background/collection'
import { createRun, runState } from '../src/background/run-state'
import { createStorageArea, createTabsStub } from './support/chrome'
import type { StubTab } from './support/chrome'
import { buildDataset } from './support/dataset'

type RunOptions = {
    initial?: Record<string, unknown>
    rejectedKeys?: string[]
    readableUrlOf?: (requestedUrl: string) => string | undefined
}

const TAB_ID = 3
const DIFFICULTY_ATTEMPT_URL = `${EAGATE_URLS.difficulty}?difficult=11&style=0&disp=1&offset=0`
const SETTINGS: Settings = { style: 0, levels: [12], delayProfile: 'fast' }
const PARSED_CHART: ParsedChart = {
    title: '冥',
    difficultyName: 'ANOTHER',
    difficulty: 'A',
    level: 12,
    style: 0,
    djLevel: 'AAA',
    exScore: 3123,
    pgreat: 1500,
    great: 123,
    missCount: null,
    lamp: 'FULL_COMBO',
}
const originalChrome = Reflect.get(globalThis, 'chrome')

const respond = (request: unknown, tab: StubTab | null): ExtractResponse => {
    const { kind } = ExtractRequestSchema.parse(request)
    const url = tab?.url ?? ''

    if (kind === 'LOGIN') return { ok: true, kind, url, login: { isLoggedIn: true, communityNickname: null, djName: 'DJ' } }
    if (kind !== 'DIFFICULTY') return { ok: false, kind: 'ERROR', reason: 'parse_error' }

    return {
        ok: true,
        kind,
        url,
        difficulty: { charts: [PARSED_CHART], rowCount: 1, skippedRowCount: 0, hasTable: true, isNoData: false, requiresLogin: false },
    }
}

const collect = async ({ initial, rejectedKeys, readableUrlOf }: RunOptions = {}) => {
    const local = createStorageArea({ initial, rejectedKeys })
    const session = createStorageArea()
    const stub = createTabsStub({ tabId: TAB_ID, respond, readableUrlOf })
    const run = createRun()

    Object.assign(globalThis, { chrome: { storage: { local: local.area, session: session.area }, tabs: stub.tabs } })
    runState.active = run

    const isStored = await runCollection(run, SETTINGS)

    return { isStored, local, session, stub, state: CollectionStateSchema.parse(local.values.get(STORAGE_KEYS.collection)) }
}

afterAll(() => {
    Object.assign(globalThis, { chrome: originalChrome })
})

describe('runCollection', () => {
    test('수집한 차트를 저장하고 수집 탭을 닫는다', async () => {
        const { isStored, local, session, stub, state } = await collect()

        expect(isStored).toBe(true)
        expect(state.status).toBe('completed')
        expect(DatasetSchema.parse(local.values.get(STORAGE_KEYS.dataset)).charts).toHaveLength(1)
        expect(stub.navigations).toEqual([`update ${EAGATE_URLS.status}`, `update ${EAGATE_URLS.notesRadar}`, `update ${DIFFICULTY_ATTEMPT_URL}`])
        expect(stub.removedTabIds).toEqual([TAB_ID])
        expect(session.values.has(SESSION_STORAGE_KEYS.collectionTabId)).toBe(false)
        expect(stub.listenerCount()).toBe(0)
        expect(runState.active).toBeNull()
    })

    test('저장소가 dataset 쓰기를 거부하면 실패로 알리고 이전 데이터를 그대로 둔다', async () => {
        const previous = await buildDataset()
        const { isStored, local, stub, state } = await collect({
            initial: { [STORAGE_KEYS.dataset]: previous },
            rejectedKeys: [STORAGE_KEYS.dataset],
        })

        expect(isStored).toBe(false)
        expect(state.status).toBe('failed')
        expect(state.phase).toBe('failed')
        expect(state.error).toEqual({ key: 'error_unknown', params: [] })
        expect(state.finishedAt).not.toBeNull()
        expect(local.values.get(STORAGE_KEYS.dataset)).toEqual(previous)
        expect(stub.removedTabIds).toEqual([TAB_ID])
        expect(runState.active).toBeNull()
    })

    test('난이도 페이지 대신 URL을 읽을 수 없는 곳에서 로딩이 끝나면 대기 초과 없이 레벨 실패로 끝낸다', async () => {
        const { isStored, local, stub, state } = await collect({
            readableUrlOf: (requestedUrl) => (requestedUrl.startsWith(EAGATE_URLS.difficulty) ? undefined : requestedUrl),
        })

        expect(isStored).toBe(false)
        expect(state.status).toBe('failed')
        expect(state.error).toEqual({ key: 'error_all_levels_failed', params: [] })
        expect(state.warnings).toContainEqual({ key: 'warning_page_url_mismatch', params: ['12', '0'] })
        expect(stub.navigations.filter((navigation) => navigation === `update ${DIFFICULTY_ATTEMPT_URL}`)).toHaveLength(2)
        expect(local.values.has(STORAGE_KEYS.dataset)).toBe(false)
        expect(stub.removedTabIds).toEqual([TAB_ID])
        expect(stub.listenerCount()).toBe(0)
    })
})
