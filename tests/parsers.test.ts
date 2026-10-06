import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'bun:test'
import { JSDOM } from 'jsdom'
import { parseDifficultyPage, parseLoginState, parseRadarSection, parseStatusPage } from '@core/eagate-parsers'
import { chartIdFrom } from '@core/chart-id'

const fixture = (name: string) => {
    const html = readFileSync(resolve(import.meta.dir, 'fixtures', name), 'utf8')
    return new JSDOM(html).window.document
}

describe('parseLoginState', () => {
    test('비로그인 페이지는 로그인되지 않은 상태로 판정한다', () => {
        const result = parseLoginState(fixture('not-logged-in.html'))

        expect(result.isLoggedIn).toBe(false)
        expect(result.djName).toBeNull()
        expect(result.communityNickname).toBeNull()
    })

    test('로그인 페이지는 DJ NAME과 커뮤니티 닉네임을 읽는다', () => {
        const result = parseLoginState(fixture('status-logged-in.html'))

        expect(result.isLoggedIn).toBe(true)
        expect(result.djName).toBe('-TEST-')
        expect(result.communityNickname).toBe('TESTPLAYER')
    })
})

describe('parseStatusPage', () => {
    test('DJ 정보와 노트레이더 6축을 읽는다', () => {
        const { player, notesRadar } = parseStatusPage(fixture('status-logged-in.html'))

        expect(player.djName).toBe('-TEST-')
        expect(player.iidxId).toBe('1234-5678')
        expect(player.danRank).toBe('十段')
        expect(player.djPoint).toBe(1234.56)
        expect(player.playCountSp).toBe(432)
        expect(player.playCountDp).toBe(123)
        expect(player.playCountTotal).toBe(555)

        expect(notesRadar.values.NOTES).toBe(128.45)
        expect(notesRadar.values.CHORD).toBe(131.22)
        expect(notesRadar.values.PEAK).toBe(118.9)
        expect(notesRadar.values.CHARGE).toBe(142)
        expect(notesRadar.values.SCRATCH).toBe(136.75)
        expect(notesRadar.values['SOF-LAN']).toBe(124.1)
        expect(notesRadar.source).toBe('status')
    })
})

describe('parseRadarSection', () => {
    test('라벨이 없는 좌표형 레이더도 순서 기반으로 읽는다', () => {
        const document = new JSDOM(`
            <div class="dj-status">
                <div id="notes"><canvas id="radar_chart_sp"></canvas></div>
            </div>
        `).window.document

        const radar = parseRadarSection(document, 'notesradar')

        expect(radar.source).toBe('notesradar')
        expect(Object.values(radar.values).every((value) => value === null)).toBe(true)
    })
})

describe('parseDifficultyPage', () => {
    test('난이도별 곡 목록 페이지를 필드 단위로 분해한다', () => {
        const result = parseDifficultyPage(fixture('difficulty-page.html'), 12, 0)

        expect(result.requiresLogin).toBe(false)
        expect(result.isNoData).toBe(false)
        expect(result.charts).toHaveLength(3)

        const [first, second, third] = result.charts

        expect(first?.title).toBe('冥')
        expect(first?.difficultyName).toBe('ANOTHER')
        expect(first?.difficulty).toBe('A')
        expect(first?.level).toBe(12)
        expect(first?.style).toBe(0)
        expect(first?.djLevel).toBe('AAA')
        expect(first?.exScore).toBe(3123)
        expect(first?.pgreat).toBe(1500)
        expect(first?.great).toBe(123)
        expect(first?.lamp).toBe('FULL_COMBO')

        expect(second?.djLevel).toBe('AA')
        expect(second?.lamp).toBe('HARD')
        expect(third?.djLevel).toBeNull()
        expect(third?.exScore).toBeNull()
        expect(third?.lamp).toBe('NO_PLAY')
    })

    test('데이터 없음 페이지를 종료 신호로 판정한다', () => {
        const result = parseDifficultyPage(fixture('difficulty-empty.html'), 12, 0)

        expect(result.isNoData).toBe(true)
        expect(result.charts).toHaveLength(0)
    })

    test('로그인 필요 페이지를 감지한다', () => {
        const result = parseDifficultyPage(fixture('not-logged-in.html'), 12, 0)

        expect(result.requiresLogin).toBe(true)
        expect(result.charts).toHaveLength(0)
    })
})

describe('chartIdFrom', () => {
    test('iidx-rank와 동일한 규칙으로 차트 식별자를 만든다', async () => {
        expect(await chartIdFrom('GAMBOL', 'A')).toBe('chart-be8ef991dcbefcfc1eae148f518a49ff')
        expect(await chartIdFrom('冥', 'A')).toBe('chart-6d4d8c5dd256f3870c3527063b541f01')
        expect(await chartIdFrom('V', 'A')).toBe('chart-e87c955fb1a1c9655cf7955628a83d4e')
    })

    test('물결표 변형과 공백을 정규화한다', async () => {
        expect(await chartIdFrom('A〜B  C', 'A')).toBe('chart-099610ea5ad6557ca089b429fac38432')
    })
})
