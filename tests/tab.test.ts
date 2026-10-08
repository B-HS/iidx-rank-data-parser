import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { EAGATE_URLS, TAB_SETTLE_DELAY_MS } from '@shared/constants'
import { flowFailureOf } from '@core/flow-error'
import { navigate, wait, waitForLoad } from '../src/background/tab'
import { createTabsStub } from './support/chrome'

const TAB_ID = 7
const OTHER_TAB_ID = 8
const UNREADABLE_URL = undefined
const SETTLE_MARGIN_MS = 100
const originalChrome = Reflect.get(globalThis, 'chrome')

const outcomeOf = async (pending: Promise<void>) => {
    try {
        await pending
        return 'loaded'
    } catch (error) {
        return flowFailureOf(error)
    }
}

const useTabs = (options: Omit<Parameters<typeof createTabsStub>[0], 'tabId'> = {}) => {
    const stub = createTabsStub({ tabId: TAB_ID, ...options })
    Object.assign(globalThis, { chrome: { tabs: stub.tabs } })

    return stub
}

const expectStatusLoad = (signal: AbortSignal, acceptsCurrentDocument = false) =>
    outcomeOf(waitForLoad({ tabId: TAB_ID, url: EAGATE_URLS.status, signal, acceptsCurrentDocument }))

beforeAll(() => {
    useTabs()
})

afterAll(() => {
    Object.assign(globalThis, { chrome: originalChrome })
})

describe('waitForLoad', () => {
    test('기대한 URL에서 로딩이 끝나면 완료한다', async () => {
        const stub = useTabs()
        const outcome = expectStatusLoad(new AbortController().signal)

        stub.finishLoad(EAGATE_URLS.status)

        expect(await outcome).toBe('loaded')
        expect(stub.listenerCount()).toBe(0)
    })

    test('로딩이 끝났는데 탭 URL을 읽을 수 없으면 기다리지 않고 url_mismatch로 실패한다', async () => {
        const stub = useTabs()
        const outcome = expectStatusLoad(new AbortController().signal)

        stub.finishLoad(UNREADABLE_URL)

        expect(await outcome).toBe('url_mismatch')
        expect(stub.listenerCount()).toBe(0)
    })

    test('읽을 수 있는 다른 페이지에서 로딩이 끝나면 url_mismatch로 실패한다', async () => {
        const stub = useTabs()
        const outcome = expectStatusLoad(new AbortController().signal)

        stub.finishLoad(EAGATE_URLS.login)

        expect(await outcome).toBe('url_mismatch')
    })

    test('로딩 중 이벤트와 다른 탭의 이벤트로는 끝내지 않는다', async () => {
        const stub = useTabs()
        const outcome = expectStatusLoad(new AbortController().signal)

        stub.emitUpdated(TAB_ID, { status: 'loading' }, { id: TAB_ID, status: 'loading', url: UNREADABLE_URL })
        stub.emitUpdated(TAB_ID, {}, { id: TAB_ID, status: 'loading', url: EAGATE_URLS.login })
        stub.emitUpdated(OTHER_TAB_ID, { status: 'complete' }, { id: OTHER_TAB_ID, status: 'complete', url: UNREADABLE_URL })

        expect(stub.listenerCount()).toBe(2)

        stub.finishLoad(EAGATE_URLS.status)

        expect(await outcome).toBe('loaded')
    })

    test('탭이 닫히면 tab_closed로 실패한다', async () => {
        const stub = useTabs()
        const outcome = expectStatusLoad(new AbortController().signal)

        stub.close()

        expect(await outcome).toBe('tab_closed')
    })

    test('중단 신호가 오면 aborted로 실패한다', async () => {
        const stub = useTabs()
        const controller = new AbortController()
        const outcome = expectStatusLoad(controller.signal)

        controller.abort()

        expect(await outcome).toBe('aborted')
        expect(stub.listenerCount()).toBe(0)
    })

    test('이미 로딩이 끝난 문서도 받을 때 URL을 읽을 수 없으면 성공으로 보지 않는다', async () => {
        const stub = useTabs()

        stub.finishLoad(UNREADABLE_URL)

        const controller = new AbortController()
        const outcome = expectStatusLoad(controller.signal, true)

        await wait(TAB_SETTLE_DELAY_MS + SETTLE_MARGIN_MS, controller.signal)
        expect(stub.listenerCount()).toBe(2)

        controller.abort()

        expect(await outcome).toBe('aborted')
    })

    test('이미 로딩이 끝난 문서도 받을 때 기대한 URL이면 완료한다', async () => {
        const stub = useTabs()

        stub.finishLoad(EAGATE_URLS.status)

        expect(await expectStatusLoad(new AbortController().signal, true)).toBe('loaded')
        expect(stub.listenerCount()).toBe(0)
    })

    test('이미 로딩이 끝난 문서도 받을 때 탭이 없으면 tab_closed로 실패한다', async () => {
        useTabs()

        expect(await expectStatusLoad(new AbortController().signal, true)).toBe('tab_closed')
    })
})

describe('navigate', () => {
    test('현재 URL을 읽을 수 없는 탭은 새로고침이 아니라 대상 URL로 이동시킨다', async () => {
        const stub = useTabs()

        stub.finishLoad(UNREADABLE_URL)

        expect(await outcomeOf(navigate(TAB_ID, EAGATE_URLS.status, new AbortController().signal))).toBe('loaded')
        expect(stub.navigations).toEqual([`update ${EAGATE_URLS.status}`])
    })

    test('이미 같은 URL에 있으면 새로고침한 문서를 기다린다', async () => {
        const stub = useTabs()

        stub.finishLoad(EAGATE_URLS.status)

        expect(await outcomeOf(navigate(TAB_ID, EAGATE_URLS.status, new AbortController().signal))).toBe('loaded')
        expect(stub.navigations).toEqual(['reload'])
    })

    test('이동한 곳의 URL을 읽을 수 없으면 url_mismatch로 실패한다', async () => {
        const stub = useTabs({ readableUrlOf: () => UNREADABLE_URL })

        stub.finishLoad(EAGATE_URLS.index)

        expect(await outcomeOf(navigate(TAB_ID, EAGATE_URLS.status, new AbortController().signal))).toBe('url_mismatch')
        expect(stub.listenerCount()).toBe(0)
    })

    test('탭이 없으면 tab_closed로 실패한다', async () => {
        useTabs()

        expect(await outcomeOf(navigate(TAB_ID, EAGATE_URLS.status, new AbortController().signal))).toBe('tab_closed')
    })
})
