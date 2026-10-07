import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { Popup } from '@widgets/popup/popup'
import { toMessage } from '@shared/message-keys'
import type { BackgroundRequest } from '@shared/messages'
import { click, findButton, installDom, render, settle } from './support/dom'
import { createI18nStub } from './support/locales'
import type { LocaleName } from './support/locales'
import { LOGGED_IN_EAMUSEMENT, LOGGED_IN_RANK_SESSION, SAVED_DATASET, buildOverview } from './support/overview'

type Responder = (request: BackgroundRequest) => unknown

const originalChrome = Reflect.get(globalThis, 'chrome')
const requests: BackgroundRequest[] = []
const storageListeners: Array<(changes: Record<string, unknown>, area: string) => void> = []

let dom: ReturnType<typeof installDom>

const installChrome = (locale: LocaleName, respond: Responder) => {
    requests.length = 0
    storageListeners.length = 0

    Object.assign(globalThis, {
        chrome: {
            i18n: createI18nStub(locale),
            runtime: {
                sendMessage: async (request: BackgroundRequest) => {
                    requests.push(request)
                    return respond(request)
                },
            },
            storage: {
                onChanged: {
                    addListener: (listener: (changes: Record<string, unknown>, area: string) => void) => storageListeners.push(listener),
                    removeListener: (listener: (changes: Record<string, unknown>, area: string) => void) => {
                        const index = storageListeners.indexOf(listener)
                        if (index >= 0) storageListeners.splice(index, 1)
                    },
                },
            },
        },
    })
}

const respondWith =
    (overview: ReturnType<typeof buildOverview>): Responder =>
    () => ({ ok: true, data: overview })

const mount = async (overview: ReturnType<typeof buildOverview>, locale: LocaleName = 'ko') => {
    installChrome(locale, respondWith(overview))
    await render(dom.root, <Popup />)
}

const text = () => dom.container.textContent ?? ''

beforeAll(() => {
    dom = installDom()
})

afterAll(() => {
    dom.restore()
    Object.assign(globalThis, { chrome: originalChrome })
})

beforeEach(async () => {
    await render(dom.root, <></>)
})

afterEach(async () => {
    await render(dom.root, <></>)
})

describe('Popup', () => {
    test('응답을 받기 전에는 불러오는 중 문구를 보인다', async () => {
        installChrome('ko', () => new Promise(() => undefined))
        await render(dom.root, <Popup />)

        expect(text()).toContain('IIDX Data Parser')
        expect(text()).toContain('불러오는 중')
        expect(dom.container.querySelector('button')).toBeNull()
    })

    test('열릴 때 개요를 읽고 iidx-rank 세션을 다시 확인한다', async () => {
        await mount(buildOverview())

        expect(requests.map((request) => request.type)).toEqual(['GET_OVERVIEW', 'CHECK_RANK_SESSION'])
    })

    test('로그인 상태를 모르면 수집 시작이 막히고 이유를 보인다', async () => {
        await mount(buildOverview())

        expect(findButton(dom.container, '데이터 수집 시작').disabled).toBe(true)
        expect(text()).toContain('먼저 e-amusement 로그인 상태를 확인해 주세요')
        expect(text()).toContain('미확인')
    })

    test('로그인 확인에 실패하면 비로그인과 다른 상태로 보인다', async () => {
        await mount(buildOverview({ login: { ...LOGGED_IN_EAMUSEMENT, isLoggedIn: false, error: { key: 'error_no_response', params: [] } } }))

        expect(text()).toContain('확인 실패')
        expect(text()).toContain('페이지에서 응답이 없습니다')
        expect(text()).toContain('로그인 상태를 확인하지 못해 수집할 수 없습니다')
    })

    test('로그인되어 있고 레벨이 있으면 수집을 시작하고 설정을 함께 보낸다', async () => {
        await mount(buildOverview({ login: LOGGED_IN_EAMUSEMENT, rank: { session: LOGGED_IN_RANK_SESSION } }))

        const start = findButton(dom.container, '데이터 수집 시작')
        expect(start.disabled).toBe(false)
        expect(text()).toContain('-TEST-')
        expect(text()).toContain('Rank User')
        expect(text()).toContain('@rank-user')

        await click(start)

        expect(requests.find((request) => request.type === 'START_COLLECTION')).toEqual({
            type: 'START_COLLECTION',
            settings: { style: 0, levels: [12], delayProfile: 'normal' },
        })
    })

    test('선택형 버튼에 aria-pressed가 있고 DP를 고르면 반영되지 않는다는 경고를 보인다', async () => {
        await mount(buildOverview({ login: LOGGED_IN_EAMUSEMENT, settings: { style: 1 }, dataset: { ...SAVED_DATASET, style: 1 } }))

        expect(findButton(dom.container, 'DP').getAttribute('aria-pressed')).toBe('true')
        expect(findButton(dom.container, 'SP').getAttribute('aria-pressed')).toBe('false')
        expect(findButton(dom.container, '12').getAttribute('aria-pressed')).toBe('true')
        expect(text()).toContain('DP를 선택하면 수집은 되지만 iidx-rank에는 반영되지 않습니다')
        expect(findButton(dom.container, 'iidx-rank에 반영').disabled).toBe(true)
        expect(text()).toContain('DP 데이터는 iidx-rank에 반영되지 않습니다')
    })

    test('수집 중에는 설정과 반영 버튼이 막히고 진행 영역이 live region이다', async () => {
        await mount(
            buildOverview({
                login: LOGGED_IN_EAMUSEMENT,
                dataset: SAVED_DATASET,
                rank: { session: LOGGED_IN_RANK_SESSION },
                collection: {
                    status: 'running',
                    phase: 'charts',
                    percent: 40,
                    message: { key: 'progress_charts', params: ['12', '2', '50'] },
                },
            }),
        )

        expect(findButton(dom.container, 'SP').disabled).toBe(true)
        expect(findButton(dom.container, '수집 중...').disabled).toBe(true)
        expect(findButton(dom.container, 'iidx-rank에 반영').disabled).toBe(true)
        expect(text()).toContain('수집 중에는 사용할 수 없습니다')
        expect(text()).toContain('레벨 12 수집 중: 2페이지 (offset 50)')
        expect(dom.container.querySelector('[role="progressbar"]')?.getAttribute('aria-label')).toBe('수집 진행률')
        expect(dom.container.querySelector('[aria-live="polite"]')?.textContent).toContain('레벨 12 수집 중')
    })

    test('경고가 4건을 넘으면 나머지는 생략 표시로 알린다', async () => {
        const warnings = Array.from({ length: 6 }, (_, index) => toMessage('warning_level_first_page_empty', { level: index + 1 }))
        await mount(buildOverview({ collection: { status: 'completed', warnings, datasetStatus: 'partial' } }))

        expect(text()).toContain('경고 6건')
        expect(text()).toContain('레벨 4: 첫 페이지에 곡이 없습니다')
        expect(text()).not.toContain('레벨 5: 첫 페이지에 곡이 없습니다')
        expect(text()).toContain('그 외 2건의 경고는 표시하지 않았습니다')
        expect(text()).toContain('일부만 수집됨')
    })

    test('마지막 반영 결과의 시각과 건수와 일치하지 않은 곡을 보인다', async () => {
        await mount(
            buildOverview({
                login: LOGGED_IN_EAMUSEMENT,
                dataset: SAVED_DATASET,
                rank: {
                    session: LOGGED_IN_RANK_SESSION,
                    lastSync: {
                        status: 'success',
                        reason: null,
                        trigger: 'auto',
                        at: '2026-10-07T10:06:00.000Z',
                        datasetGeneratedAt: SAVED_DATASET.generatedAt,
                        user: LOGGED_IN_RANK_SESSION.user,
                        importId: 12,
                        importedAt: '2026-10-07T10:06:00.000Z',
                        receivedCount: 612,
                        matchedCount: 598,
                        changedCount: 41,
                        unmatchedCount: 7,
                        unmatchedPreview: [{ title: '<b>길고 긴 곡 제목</b>', difficulty: 'A' }],
                        serverCode: null,
                    },
                },
            }),
        )

        expect(text()).toContain('반영 성공')
        expect(text()).toContain('자동 (수집 직후)')
        expect(text()).toContain('598')
        expect(text()).toContain('41')
        expect(text()).toContain('<b>길고 긴 곡 제목</b> (A)')
        expect(dom.container.querySelector('b')).toBeNull()
        expect(text()).toContain('외 6곡')
    })

    test('반영 실패는 사유와 서버 코드를 보인다', async () => {
        await mount(
            buildOverview({
                login: LOGGED_IN_EAMUSEMENT,
                dataset: SAVED_DATASET,
                rank: {
                    session: LOGGED_IN_RANK_SESSION,
                    lastSync: {
                        status: 'failed',
                        reason: 'origin_rejected',
                        trigger: 'manual',
                        at: '2026-10-07T10:06:00.000Z',
                        datasetGeneratedAt: null,
                        user: null,
                        importId: null,
                        importedAt: null,
                        receivedCount: null,
                        matchedCount: null,
                        changedCount: null,
                        unmatchedCount: null,
                        unmatchedPreview: [],
                        serverCode: 'ORIGIN_NOT_ALLOWED',
                    },
                },
            }),
        )

        expect(text()).toContain('반영 실패')
        expect(text()).toContain('서버에 익스텐션 ID가 등록되어 있는지')
        expect(text()).toContain('ORIGIN_NOT_ALLOWED')
    })

    test('iidx-rank에 로그인되어 있지 않으면 로그인 열기와 다시 확인 버튼을 보이고 반영을 막는다', async () => {
        await mount(
            buildOverview({
                login: LOGGED_IN_EAMUSEMENT,
                dataset: SAVED_DATASET,
                rank: { session: { user: null, checkedAt: '2026-10-07T10:00:00.000Z', error: null } },
            }),
        )

        expect(text()).toContain('대상: https://iidx.hyns.dev')
        expect(findButton(dom.container, 'iidx-rank 로그인 열기').disabled).toBe(false)
        expect(findButton(dom.container, '다시 확인').disabled).toBe(false)
        expect(findButton(dom.container, 'iidx-rank에 반영').disabled).toBe(true)
        expect(text()).toContain('iidx-rank에 로그인해야 반영할 수 있습니다')

        await click(findButton(dom.container, 'iidx-rank 로그인 열기'))

        expect(requests.some((request) => request.type === 'OPEN_RANK_LOGIN')).toBe(true)
    })

    test('저장 데이터 삭제는 화면 안 확인 단계를 거친 뒤에만 실행된다', async () => {
        await mount(buildOverview({ login: LOGGED_IN_EAMUSEMENT, dataset: SAVED_DATASET }))

        await click(findButton(dom.container, '저장 데이터 삭제'))

        expect(text()).toContain('되돌릴 수 없습니다')
        expect(requests.some((request) => request.type === 'CLEAR_DATA')).toBe(false)

        await click(findButton(dom.container, '취소'))
        expect(text()).not.toContain('되돌릴 수 없습니다')
        expect(requests.some((request) => request.type === 'CLEAR_DATA')).toBe(false)

        await click(findButton(dom.container, '저장 데이터 삭제'))
        await click(findButton(dom.container, '삭제 확인'))

        expect(requests.some((request) => request.type === 'CLEAR_DATA')).toBe(true)
    })

    test('background가 응답하지 않으면 오류를 보이고 불러오는 중 상태에 머물지 않는다', async () => {
        installChrome('ko', () => undefined)
        await render(dom.root, <Popup />)

        expect(dom.container.querySelector('[role="alert"]')?.textContent).toContain('백그라운드 작업이 응답하지 않습니다')
        expect(text()).not.toContain('불러오는 중')
    })

    test('sendMessage가 거부되어도 오류를 보인다', async () => {
        installChrome('ko', () => Promise.reject(new Error('Could not establish connection')))
        await render(dom.root, <Popup />)

        expect(dom.container.querySelector('[role="alert"]')?.textContent).toContain('백그라운드 작업이 응답하지 않습니다')
    })

    test('형식이 맞지 않는 응답은 오류로 처리한다', async () => {
        installChrome('ko', () => ({ ok: true, data: { collection: 'invalid' } }))
        await render(dom.root, <Popup />)

        expect(dom.container.querySelector('[role="alert"]')?.textContent).toContain('응답 형식이 올바르지 않습니다')
    })

    test('저장소가 바뀌면 개요를 다시 읽는다', async () => {
        await mount(buildOverview())
        const before = requests.length

        storageListeners.forEach((listener) => listener({ 'iidx:collection:v2': {} }, 'local'))
        await settle()

        expect(requests.length).toBe(before + 1)
        expect(requests.at(-1)?.type).toBe('GET_OVERVIEW')
    })

    test('브라우저 언어가 영어면 영어 문구를 보인다', async () => {
        await mount(buildOverview({ login: LOGGED_IN_EAMUSEMENT }), 'en')

        expect(text()).toContain('Start collecting')
        expect(text()).toContain('Logged in')
        expect(text()).not.toContain('데이터 수집 시작')
    })

    test('번역되지 않은 키가 있어도 빈 문자열 대신 키가 보인다', async () => {
        installChrome('ko', respondWith(buildOverview()))
        Object.assign(Reflect.get(globalThis, 'chrome'), { i18n: { getMessage: () => '', getUILanguage: () => 'ko' } })
        await render(dom.root, <Popup />)

        expect(text()).toContain('popup_action_start')
        expect(dom.container.querySelector('button')?.textContent).not.toBe('')
    })
})
