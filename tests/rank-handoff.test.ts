import { describe, expect, test } from 'bun:test'
import { RANK_HANDOFF_TTL_MS } from '@shared/rank-schema'
import { isRankHandoffAlive, isRankTabSender } from '@core/rank-handoff'

const CREATED_AT = '2026-10-07T10:00:00.000Z'
const CREATED_MS = Date.parse(CREATED_AT)
const HANDOFF = { handoffId: 'handoff-1', createdAt: CREATED_AT }

const EXPECTED = { extensionId: 'extension-id', origin: 'https://iidx.hyns.dev' }
const RANK_SENDER = { id: 'extension-id', url: 'https://iidx.hyns.dev/import', origin: 'https://iidx.hyns.dev', frameId: 0, tab: { id: 7 } }

describe('isRankHandoffAlive', () => {
    test('만료 시간은 10분이다', () => {
        expect(RANK_HANDOFF_TTL_MS).toBe(600_000)
    })

    test('만든 뒤 만료 시간 전까지만 유효하다', () => {
        expect(isRankHandoffAlive(HANDOFF, CREATED_MS)).toBe(true)
        expect(isRankHandoffAlive(HANDOFF, CREATED_MS + RANK_HANDOFF_TTL_MS - 1)).toBe(true)
        expect(isRankHandoffAlive(HANDOFF, CREATED_MS + RANK_HANDOFF_TTL_MS)).toBe(false)
        expect(isRankHandoffAlive(HANDOFF, CREATED_MS + RANK_HANDOFF_TTL_MS * 2)).toBe(false)
    })

    test('handoff가 없으면 유효하지 않다', () => {
        expect(isRankHandoffAlive(null, CREATED_MS)).toBe(false)
    })
})

describe('isRankTabSender', () => {
    test('iidx-rank 탭의 최상위 프레임에서 온 이 익스텐션의 메시지만 받아들인다', () => {
        expect(isRankTabSender(RANK_SENDER, EXPECTED)).toBe(true)
        expect(isRankTabSender({ ...RANK_SENDER, url: 'https://iidx.hyns.dev/settings?tab=import', origin: undefined }, EXPECTED)).toBe(true)
    })

    test('popup처럼 탭이 아닌 곳에서 온 메시지는 거부한다', () => {
        expect(isRankTabSender({ id: 'extension-id', url: 'chrome-extension://extension-id/popup/index.html' }, EXPECTED)).toBe(false)
        expect(isRankTabSender({ ...RANK_SENDER, tab: undefined }, EXPECTED)).toBe(false)
        expect(isRankTabSender({}, EXPECTED)).toBe(false)
    })

    test('다른 출처의 탭과 하위 프레임과 다른 익스텐션은 거부한다', () => {
        expect(isRankTabSender({ ...RANK_SENDER, url: 'https://p.eagate.573.jp/game/2dx/34/index.html', origin: undefined }, EXPECTED)).toBe(false)
        expect(isRankTabSender({ ...RANK_SENDER, url: 'http://iidx.hyns.dev/import', origin: undefined }, EXPECTED)).toBe(false)
        expect(isRankTabSender({ ...RANK_SENDER, url: 'https://iidx.hyns.dev.evil.test/import', origin: undefined }, EXPECTED)).toBe(false)
        expect(isRankTabSender({ ...RANK_SENDER, origin: 'null' }, EXPECTED)).toBe(false)
        expect(isRankTabSender({ ...RANK_SENDER, frameId: 3 }, EXPECTED)).toBe(false)
        expect(isRankTabSender({ ...RANK_SENDER, id: 'another-extension' }, EXPECTED)).toBe(false)
        expect(isRankTabSender({ ...RANK_SENDER, url: 'not a url' }, EXPECTED)).toBe(false)
        expect(isRankTabSender({ ...RANK_SENDER, url: undefined }, EXPECTED)).toBe(false)
    })
})
