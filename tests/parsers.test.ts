import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'bun:test'
import { JSDOM } from 'jsdom'
import { parseDifficultyPage, parseLoginState, parseRadarSection, parseStatusPage } from '@core/eagate-parsers'
import { NotesRadarSchema } from '@shared/schema'
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
        expect(notesRadar.matchedByLabel).toBe(true)
    })

    test('값이 비어 있는 IIDX ID와 단위는 null로 읽는다', () => {
        const document = new JSDOM(`
            <div class="dj-status">
                <div class="dj-profile">
                    <table>
                        <tr><td>IIDX ID</td><td>---</td></tr>
                        <tr><td>段位</td><td>--</td></tr>
                    </table>
                </div>
            </div>
        `).window.document

        const { player } = parseStatusPage(document)

        expect(player.iidxId).toBeNull()
        expect(player.danRank).toBeNull()
    })

    test('합계 표기가 없으면 SP 횟수를 합계로 쓰지 않는다', () => {
        const statusWith = (playCount: string) =>
            new JSDOM(`
                <div class="dj-status">
                    <div class="dj-rank">
                        <div class="visit-cat"><div>プレー回数</div><div>${playCount}</div></div>
                    </div>
                </div>
            `).window.document

        const split = parseStatusPage(statusWith('SP: 432 / DP: 123')).player
        const single = parseStatusPage(statusWith('555回')).player

        expect(split.playCountSp).toBe(432)
        expect(split.playCountDp).toBe(123)
        expect(split.playCountTotal).toBeNull()
        expect(single.playCountTotal).toBe(555)
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
        expect(radar.raw).toHaveLength(0)
    })

    test('빈 라벨 페어를 결과에서 제거한다', () => {
        const document = new JSDOM(`
            <div class="dj-status">
                <div id="notes">
                    <ul>
                        <li><p></p><p>128.45</p></li>
                        <li><p>NOTES</p><p>128.45</p></li>
                        <li><p>CHORD</p><p>131.22</p></li>
                    </ul>
                </div>
            </div>
        `).window.document

        const radar = parseRadarSection(document, 'status')

        expect(radar.raw.every((pair) => pair.label !== '')).toBe(true)
        expect(radar.values.NOTES).toBe(128.45)
        expect(radar.values.CHORD).toBe(131.22)
    })

    test('레이더 영역이 없으면 본문의 다른 숫자를 레이더로 읽지 않는다', () => {
        const document = new JSDOM(`
            <body>
                <p>TOTAL NOTES 1500 / PEAK 2位</p>
                <table>
                    <tr><td>a</td><td>1</td></tr>
                    <tr><td>b</td><td>2</td></tr>
                    <tr><td>c</td><td>3</td></tr>
                    <tr><td>d</td><td>4</td></tr>
                    <tr><td>e</td><td>5</td></tr>
                    <tr><td>f</td><td>6</td></tr>
                </table>
            </body>
        `).window.document

        const radar = parseRadarSection(document, 'notesradar')

        expect(Object.values(radar.values).every((value) => value === null)).toBe(true)
        expect(radar.matchedByLabel).toBe(false)
    })

    test('라벨이 없는 순서 기반 추정은 #notes 안의 정확히 6개 항목일 때만 쓴다', () => {
        const items = (count: number) => Array.from({ length: count }, (_, index) => `<li><p>item${index}</p><p>${index + 1}.5</p></li>`).join('')
        const inNotes = (count: number) => new JSDOM(`<div id="notes"><ul>${items(count)}</ul></div>`).window.document
        const inStatus = new JSDOM(`<div class="dj-status"><ul>${items(6)}</ul></div>`).window.document

        const exact = parseRadarSection(inNotes(6), 'notesradar')

        expect(exact.values.NOTES).toBe(1.5)
        expect(exact.values['SOF-LAN']).toBe(6.5)
        expect(exact.matchedByLabel).toBe(false)
        expect(Object.values(parseRadarSection(inNotes(7), 'notesradar').values).every((value) => value === null)).toBe(true)
        expect(Object.values(parseRadarSection(inStatus, 'notesradar').values).every((value) => value === null)).toBe(true)
    })

    test('음수 값은 레이더 값으로 쓰지 않는다', () => {
        const document = new JSDOM(`<div id="notes"><ul><li><p>NOTES</p><p>-12.5</p></li><li><p>CHORD</p><p>131.22</p></li></ul></div>`).window
            .document

        const radar = parseRadarSection(document, 'status')

        expect(radar.values.NOTES).toBeNull()
        expect(radar.values.CHORD).toBe(131.22)
    })

    test('저장 가능한 형식을 만족한다', () => {
        const document = new JSDOM(`
            <div class="dj-status">
                <div id="notes">
                    <ul>
                        <li><p></p><p></p></li>
                        <li><p>NOTES</p><p>128.45</p></li>
                    </ul>
                </div>
            </div>
        `).window.document

        const radar = parseRadarSection(document, 'status')

        expect(NotesRadarSchema.safeParse(radar).success).toBe(true)
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

        expect(result.hasTable).toBe(true)
        expect(result.rowCount).toBe(3)
        expect(result.skippedRowCount).toBe(0)
        expect(result.charts.every((chart) => chart.missCount === null)).toBe(true)
    })

    test('데이터 없음 페이지를 종료 신호로 판정한다', () => {
        const result = parseDifficultyPage(fixture('difficulty-empty.html'), 12, 0)

        expect(result.isNoData).toBe(true)
        expect(result.hasTable).toBe(false)
        expect(result.charts).toHaveLength(0)
    })

    test('로그인 필요 페이지를 감지한다', () => {
        const result = parseDifficultyPage(fixture('not-logged-in.html'), 12, 0)

        expect(result.requiresLogin).toBe(true)
        expect(result.charts).toHaveLength(0)
    })

    test('목록이 있으면 이전 페이지의 데이터 없음 안내가 남아 있어도 종료로 보지 않는다', () => {
        const result = parseDifficultyPage(fixture('difficulty-with-stale-notice.html'), 12, 0)

        expect(result.isNoData).toBe(false)
        expect(result.charts).toHaveLength(2)
    })

    test('램프 이미지가 없는 행은 곡으로 세지 않되 건너뛴 행으로 센다', () => {
        const result = parseDifficultyPage(fixture('difficulty-with-summary-row.html'), 12, 0)

        expect(result.charts).toHaveLength(1)
        expect(result.charts[0]?.title).toBe('冥')
        expect(result.rowCount).toBe(2)
        expect(result.skippedRowCount).toBe(1)
    })

    test('표도 데이터 없음 안내도 없는 페이지는 종료 신호로 보지 않는다', () => {
        const document = new JSDOM('<div id="base"><p>ただいまメンテナンス中です。</p></div>').window.document
        const result = parseDifficultyPage(document, 12, 0)

        expect(result.hasTable).toBe(false)
        expect(result.isNoData).toBe(false)
        expect(result.rowCount).toBe(0)
    })

    test('해석하지 못한 행도 행 수에 포함한다', () => {
        const row = (title: string, difficulty: string, lamp: string) => `
            <tr>
                <td>${title}</td>
                <td>${difficulty}</td>
                <td></td>
                <td>3,123(1,500/123)</td>
                <td>${lamp}</td>
            </tr>`
        const lampImage = '<img src="/game/2dx/34/images/clflg/clflg4.gif" />'
        const document = new JSDOM(`
            <div class="series-difficulty">
                <table>
                    <tr><th>楽曲名</th><th>難易度</th><th>DJ LEVEL</th><th>SCORE</th><th>CLEAR LAMP</th></tr>
                    ${row('<a class="music_info">MISS 3 TIMES</a>', 'ANOTHER', lampImage)}
                    ${row('앵커 없는 곡', 'HYPER', lampImage)}
                    ${row('<a class="music_info">모르는 난이도</a>', 'UNKNOWN', lampImage)}
                    ${row('<a class="music_info">모르는 램프</a>', 'ANOTHER', '<img src="/game/2dx/34/images/clflg/clflg9.gif" />')}
                    <tr><td></td><td></td><td></td><td></td><td>合計</td></tr>
                </table>
            </div>
        `).window.document

        const result = parseDifficultyPage(document, 12, 0)
        const [first, second] = result.charts

        expect(result.rowCount).toBe(4)
        expect(result.skippedRowCount).toBe(2)
        expect(result.charts).toHaveLength(2)
        expect(first?.title).toBe('MISS 3 TIMES')
        expect(first?.missCount).toBeNull()
        expect(first?.exScore).toBe(3123)
        expect(first?.pgreat).toBe(1500)
        expect(first?.great).toBe(123)
        expect(second?.title).toBe('앵커 없는 곡')
        expect(second?.difficulty).toBe('H')
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
