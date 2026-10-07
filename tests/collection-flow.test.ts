import { describe, expect, test } from 'bun:test'
import { COLLECTION_STALE_MS, DIFFICULTY_OFFSET_STEP } from '@shared/constants'
import type { NotesRadar } from '@shared/schema'
import { classifyDifficultyPage, isCollectionStale, pickNotesRadar } from '@core/collection-flow'

const page = { rowCount: DIFFICULTY_OFFSET_STEP, hasTable: true, isNoData: false, requiresLogin: false }

const radar = (notes: number | null, matchedByLabel: boolean): NotesRadar => ({
    values: { NOTES: notes, CHORD: null, PEAK: null, CHARGE: null, SCRATCH: null, 'SOF-LAN': null },
    raw: [],
    source: 'notesradar',
    matchedByLabel,
})

describe('classifyDifficultyPage', () => {
    test('행이 가득 찬 페이지는 다음 페이지로 이어진다', () => {
        expect(classifyDifficultyPage(page, DIFFICULTY_OFFSET_STEP)).toBe('next')
    })

    test('행 수가 페이지 크기보다 적으면 레벨의 끝이다', () => {
        expect(classifyDifficultyPage({ ...page, rowCount: DIFFICULTY_OFFSET_STEP - 1 }, DIFFICULTY_OFFSET_STEP)).toBe('end')
        expect(classifyDifficultyPage({ ...page, rowCount: 0 }, DIFFICULTY_OFFSET_STEP)).toBe('end')
    })

    test('데이터 없음 안내는 레벨의 끝이다', () => {
        expect(classifyDifficultyPage({ rowCount: 0, hasTable: false, isNoData: true, requiresLogin: false }, DIFFICULTY_OFFSET_STEP)).toBe('end')
    })

    test('표도 안내도 없는 페이지는 끝이 아니라 예상 밖 페이지다', () => {
        expect(classifyDifficultyPage({ rowCount: 0, hasTable: false, isNoData: false, requiresLogin: false }, DIFFICULTY_OFFSET_STEP)).toBe(
            'unexpected_page',
        )
    })

    test('로그인 필요 페이지를 다른 판정보다 먼저 본다', () => {
        expect(classifyDifficultyPage({ rowCount: 0, hasTable: false, isNoData: true, requiresLogin: true }, DIFFICULTY_OFFSET_STEP)).toBe(
            'login_required',
        )
    })
})

describe('isCollectionStale', () => {
    const now = Date.parse('2026-10-07T10:00:00.000Z')
    const at = (msAgo: number) => new Date(now - msAgo).toISOString()

    test('진행 중이 아니면 오래되어도 멈춘 것으로 보지 않는다', () => {
        expect(isCollectionStale({ status: 'completed', updatedAt: at(COLLECTION_STALE_MS * 2), startedAt: null }, now, COLLECTION_STALE_MS)).toBe(
            false,
        )
    })

    test('최근에 갱신된 진행 상태는 살아 있다', () => {
        expect(isCollectionStale({ status: 'running', updatedAt: at(COLLECTION_STALE_MS - 1), startedAt: null }, now, COLLECTION_STALE_MS)).toBe(
            false,
        )
    })

    test('오래 갱신되지 않은 진행 상태는 멈춘 것으로 본다', () => {
        expect(isCollectionStale({ status: 'running', updatedAt: at(COLLECTION_STALE_MS + 1), startedAt: null }, now, COLLECTION_STALE_MS)).toBe(true)
        expect(isCollectionStale({ status: 'running', updatedAt: null, startedAt: at(COLLECTION_STALE_MS + 1) }, now, COLLECTION_STALE_MS)).toBe(true)
        expect(isCollectionStale({ status: 'running', updatedAt: null, startedAt: null }, now, COLLECTION_STALE_MS)).toBe(true)
    })
})

describe('pickNotesRadar', () => {
    test('값이 있는 첫 후보를 고른다', () => {
        const status = radar(128.45, true)

        expect(pickNotesRadar([radar(null, false), status])).toBe(status)
    })

    test('라벨로 확인한 후보를 순서로 추정한 후보보다 먼저 고른다', () => {
        const guessed = radar(1, false)
        const labeled = radar(128.45, true)

        expect(pickNotesRadar([guessed, labeled])).toBe(labeled)
    })

    test('값이 있는 후보가 없으면 남은 후보를 고르고 모두 없으면 null이다', () => {
        const empty = radar(null, false)

        expect(pickNotesRadar([null, empty])).toBe(empty)
        expect(pickNotesRadar([null, null])).toBeNull()
    })
})
