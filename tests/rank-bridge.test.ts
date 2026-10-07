import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { JSDOM } from 'jsdom'
import { RANK_BRIDGE_CHANNEL, RankBridgeExtensionMessageSchema } from '@shared/rank-bridge-schema'
import type { RankHandoffPayload, RankHandoffResult, RankImportResult } from '@shared/rank-schema'
import { startRankBridge } from '@core/rank-bridge'
import { toRankPayload } from '@core/rank-sync'
import { buildDataset } from './support/dataset'

type Posted = { message: unknown; targetOrigin: unknown }

const PAGE_ORIGIN = 'https://rank.test'
const HANDOFF_ID = 'handoff-1'
const FLUSH_ROUNDS = 3

const importResult: RankImportResult = {
    importId: 12,
    channel: 'extension',
    importedAt: '2026-10-07T10:06:01.000Z',
    receivedCount: 1,
    matchedCount: 1,
    changedCount: 1,
    unmatched: [{ title: '곡명', difficulty: 'A' }],
}

const windowOf = (target: JSDOM) => {
    const view = target.window.document.defaultView
    if (view === null) throw new Error('jsdom window missing')

    return view
}

const flush = async () => {
    for (let round = 0; round < FLUSH_ROUNDS; round += 1) await new Promise((resolve) => setTimeout(resolve, 0))
}

const buildHandoff = async (): Promise<RankHandoffPayload> => {
    const payload = toRankPayload(await buildDataset())
    if (!payload.ok) throw new Error('fixture dataset must be reflectable')

    return { handoffId: HANDOFF_ID, payload: payload.payload }
}

let dom: JSDOM
let view: Window
let posted: Posted[]
let handoffRequests: number
let reported: RankHandoffResult[]
let nextHandoff: () => Promise<RankHandoffPayload | null>
let stop: () => void

const receive = (data: unknown, init: { origin?: string; source?: MessageEventSource | null } = {}) => {
    const source = 'source' in init ? init.source : view
    view.dispatchEvent(new dom.window.MessageEvent('message', { data, origin: init.origin ?? PAGE_ORIGIN, source }))
}

const postedAfterHello = () => posted.slice(1).map(({ message }) => message)

beforeEach(() => {
    dom = new JSDOM('<!doctype html><html></html>', { url: `${PAGE_ORIGIN}/import` })
    view = windowOf(dom)
    posted = []
    handoffRequests = 0
    reported = []
    nextHandoff = async () => null

    Object.assign(view, { postMessage: (message: unknown, targetOrigin: unknown) => posted.push({ message, targetOrigin }) })

    stop = startRankBridge({
        view,
        requestHandoff: async () => {
            handoffRequests += 1
            return nextHandoff()
        },
        reportResult: async (result) => {
            reported.push(result)
        },
    })
})

afterEach(() => {
    stop()
    dom.window.close()
})

describe('startRankBridge', () => {
    test('시작하면 페이지 출처로만 hello를 보낸다', () => {
        expect(posted).toEqual([{ message: { channel: RANK_BRIDGE_CHANNEL, type: 'hello' }, targetOrigin: PAGE_ORIGIN }])
        expect(RANK_BRIDGE_CHANNEL).toBe('iidx-rank-import')
        expect(handoffRequests).toBe(0)
    })

    test('ready를 받을 때마다 background에 handoff를 묻고 같은 본문을 다시 넘긴다', async () => {
        const handoff = await buildHandoff()
        nextHandoff = async () => handoff

        receive({ channel: RANK_BRIDGE_CHANNEL, type: 'ready' })
        await flush()
        receive({ channel: RANK_BRIDGE_CHANNEL, type: 'ready' })
        await flush()

        const expected = { channel: RANK_BRIDGE_CHANNEL, type: 'payload', handoffId: HANDOFF_ID, payload: handoff.payload }

        expect(handoffRequests).toBe(2)
        expect(postedAfterHello()).toEqual([expected, expected])
        expect(posted.every(({ targetOrigin }) => targetOrigin === PAGE_ORIGIN)).toBe(true)
        expect(posted.every(({ message }) => RankBridgeExtensionMessageSchema.safeParse(message).success)).toBe(true)
    })

    test('대기 중인 handoff가 없거나 background가 응답하지 않으면 none을 보낸다', async () => {
        receive({ channel: RANK_BRIDGE_CHANNEL, type: 'ready' })
        await flush()

        nextHandoff = async () => Promise.reject(new Error('Extension context invalidated'))
        receive({ channel: RANK_BRIDGE_CHANNEL, type: 'ready' })
        await flush()

        expect(postedAfterHello()).toEqual([
            { channel: RANK_BRIDGE_CHANNEL, type: 'none' },
            { channel: RANK_BRIDGE_CHANNEL, type: 'none' },
        ])
    })

    test('성공 result는 검증한 뒤 background에 전달하고 모르는 필드는 버린다', async () => {
        receive({
            channel: RANK_BRIDGE_CHANNEL,
            type: 'result',
            handoffId: HANDOFF_ID,
            outcome: {
                status: 'success',
                result: { ...importResult, changes: [{ chartId: 'chart-6d4d8c5dd256f3870c3527063b541f01', previousLamp: null, lamp: 'HARD' }] },
            },
        })
        await flush()

        expect(reported).toEqual([{ handoffId: HANDOFF_ID, outcome: { status: 'success', result: importResult } }])
        expect(postedAfterHello()).toEqual([])
    })

    test('실패 result는 코드를 그대로 전달한다', async () => {
        receive({ channel: RANK_BRIDGE_CHANNEL, type: 'result', handoffId: HANDOFF_ID, outcome: { status: 'failed', code: 'AUTH_REQUIRED' } })
        await flush()

        expect(reported).toEqual([{ handoffId: HANDOFF_ID, outcome: { status: 'failed', code: 'AUTH_REQUIRED' } }])
    })

    test('다른 창이나 다른 출처에서 온 메시지는 무시한다', async () => {
        const other = new JSDOM('', { url: 'https://evil.test/' })
        const ready = { channel: RANK_BRIDGE_CHANNEL, type: 'ready' }
        const result = { channel: RANK_BRIDGE_CHANNEL, type: 'result', handoffId: HANDOFF_ID, outcome: { status: 'failed', code: 'AUTH_REQUIRED' } }

        receive(ready, { source: windowOf(other) })
        receive(ready, { source: null })
        receive(ready, { origin: 'https://evil.test' })
        receive(ready, { origin: 'http://rank.test' })
        receive(result, { source: windowOf(other) })
        receive(result, { origin: 'https://evil.test' })
        await flush()
        other.window.close()

        expect(handoffRequests).toBe(0)
        expect(reported).toEqual([])
        expect(postedAfterHello()).toEqual([])
    })

    test('채널이나 형식이 다른 메시지는 응답 없이 무시한다', async () => {
        receive({ channel: 'another-channel', type: 'ready' })
        receive({ type: 'ready' })
        receive({ channel: RANK_BRIDGE_CHANNEL, type: 'unknown' })
        receive({ channel: RANK_BRIDGE_CHANNEL, type: 'hello' })
        receive({ channel: RANK_BRIDGE_CHANNEL, type: 'none' })
        receive({ channel: RANK_BRIDGE_CHANNEL, type: 'payload', handoffId: HANDOFF_ID, payload: {} })
        receive({ channel: RANK_BRIDGE_CHANNEL, type: 'result', outcome: { status: 'failed', code: 'AUTH_REQUIRED' } })
        receive({ channel: RANK_BRIDGE_CHANNEL, type: 'result', handoffId: '', outcome: { status: 'failed', code: 'AUTH_REQUIRED' } })
        receive({ channel: RANK_BRIDGE_CHANNEL, type: 'result', handoffId: HANDOFF_ID, outcome: { status: 'failed' } })
        receive({ channel: RANK_BRIDGE_CHANNEL, type: 'result', handoffId: HANDOFF_ID, outcome: { status: 'success', result: { importId: 'x' } } })
        receive({ channel: RANK_BRIDGE_CHANNEL, type: 'result', handoffId: HANDOFF_ID, outcome: { status: 'done' } })
        receive('ready')
        receive(null)
        await flush()

        expect(handoffRequests).toBe(0)
        expect(reported).toEqual([])
        expect(postedAfterHello()).toEqual([])
    })

    test('멈춘 뒤에는 메시지를 처리하지 않는다', async () => {
        stop()
        receive({ channel: RANK_BRIDGE_CHANNEL, type: 'ready' })
        await flush()

        expect(handoffRequests).toBe(0)
        expect(postedAfterHello()).toEqual([])
    })
})
