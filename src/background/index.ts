import {
    DATASET_FORMAT,
    DATASET_SCHEMA_VERSION,
    DELAY_PROFILES,
    DIFFICULTY_MAX_PAGES_PER_LEVEL,
    DIFFICULTY_OFFSET_STEP,
    DIFFICULTY_PAGE_ESTIMATE,
    EAGATE_ORIGIN,
    EAGATE_URLS,
    EXPORT_FILE_PREFIX,
    GAME_BASE_PATH,
    GAME_VERSION,
    LEVEL_MAX,
    LEVEL_MIN,
    LOGIN_STATE_MAX_AGE_MS,
} from '@shared/constants'
import { DEFAULT_SETTINGS, DatasetSchema } from '@shared/schema'
import type { Chart, CollectionState, Dataset, LoginState, Settings } from '@shared/schema'
import {
    clearDataset,
    readCollection,
    readCollectionTabId,
    readDataset,
    readLogin,
    readSettings,
    writeCollection,
    writeCollectionTabId,
    writeDataset,
    writeLogin,
    writeSettings,
} from '@shared/storage'
import type { BackgroundRequest, BackgroundResponse, ExtractRequest, ExtractResponse, Overview } from '@shared/messages'
import { chartIdFrom } from '@core/chart-id'
import { toRankImport } from '@core/rank-export'

export const COLLECTION_CANCELLED = 'collection-cancelled'

const runState: { cancelled: boolean } = { cancelled: false }

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const waitRandom = (minMs: number, maxMs: number) => wait(minMs + Math.random() * (maxMs - minMs))

const setProgress = async (patch: Partial<CollectionState>) => {
    const current = await readCollection()
    const next: CollectionState = { ...current, ...patch }
    await writeCollection(next)

    return next
}

const openCollectionTab = async () => {
    const tab = await chrome.tabs.create({ url: EAGATE_URLS.index, active: true })
    if (tab.id === undefined) throw new Error('수집용 탭을 열지 못했습니다.')

    await writeCollectionTabId(tab.id)
    return tab.id
}

const closeCollectionTab = async (tabId: number) => {
    await writeCollectionTabId(null)
    await chrome.tabs.remove(tabId).catch(() => undefined)
}

const waitForLoad = (tabId: number, url: string, timeoutMs: number) =>
    new Promise<void>((resolve, reject) => {
        let settled = false

        const matches = (tab: chrome.tabs.Tab) => tab.status === 'complete' && (tab.url ?? '').split('?')[0] === url.split('?')[0]

        const finish = (error?: Error) => {
            if (settled) return
            settled = true
            chrome.tabs.onUpdated.removeListener(listener)
            clearTimeout(timer)
            if (error === undefined) resolve()
            else reject(error)
        }

        const listener = (changedTabId: number, _changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => {
            if (changedTabId !== tabId) return
            if (matches(tab)) finish()
        }

        const timer = setTimeout(() => finish(new Error('페이지 로딩 시간이 초과되었습니다.')), timeoutMs)

        chrome.tabs.onUpdated.addListener(listener)
        void chrome.tabs.get(tabId).then((tab) => {
            if (matches(tab)) setTimeout(() => finish(), 600)
        })
    })

const navigate = async (tabId: number, url: string) => {
    const current = await chrome.tabs.get(tabId).catch(() => null)

    if (current !== null && current.url === url) await chrome.tabs.reload(tabId)
    else await chrome.tabs.update(tabId, { url, active: true })

    await waitForLoad(tabId, url, 30_000)
}

const requestExtract = async (tabId: number, request: ExtractRequest): Promise<ExtractResponse> => {
    const raw: unknown = await chrome.tabs.sendMessage(tabId, request).catch(() => null)
    if (raw === null || typeof raw !== 'object' || !('ok' in raw)) {
        return { ok: false, error: '콘텐츠 스크립트가 응답하지 않습니다. e-agate 탭 상태를 확인해 주세요.' }
    }

    return raw as ExtractResponse
}

const injectedRadarJson = async (gameVersion: number, style: number, timeoutMs: number) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
        const response = await fetch(`/game/2dx/${gameVersion}/djdata/music/json/notesradar.html`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' },
            body: new URLSearchParams({ style: String(style), play_style: String(style) }).toString(),
            credentials: 'include',
            signal: controller.signal,
        })

        if (!response.ok) return null
        const text = await response.text()

        return text.trim() === '' ? null : text
    } catch {
        return null
    } finally {
        clearTimeout(timer)
    }
}

const fetchRadarJson = async (tabId: number, style: 0 | 1) => {
    const results = await chrome.scripting.executeScript({
        target: { tabId },
        args: [GAME_VERSION, style, 8_000],
        func: injectedRadarJson,
    })

    const text = results[0]?.result
    if (typeof text !== 'string') return null

    try {
        return JSON.parse(text) as unknown
    } catch {
        return null
    }
}

const checkLoginIn = async (tabId: number): Promise<LoginState> => {
    await waitForLoad(tabId, EAGATE_URLS.index, 25_000)
    const response = await requestExtract(tabId, { type: 'EXTRACT', kind: 'LOGIN' })
    if (!response.ok || response.payload.login === null) throw new Error(response.ok ? '로그인 상태를 읽지 못했습니다.' : response.error)

    return {
        isLoggedIn: response.payload.login.isLoggedIn,
        communityNickname: response.payload.login.communityNickname,
        djName: response.payload.login.djName,
        checkedAt: new Date().toISOString(),
        pageUrl: response.payload.url,
    }
}

const checkLoginState = async (): Promise<LoginState> => {
    const tabId = await openCollectionTab()

    try {
        return await checkLoginIn(tabId)
    } finally {
        await closeCollectionTab(tabId)
    }
}

const ensureLoggedIn = async (tabId: number) => {
    const cached = await readLogin()
    if (cached !== null && cached.isLoggedIn && Date.now() - Date.parse(cached.checkedAt) < LOGIN_STATE_MAX_AGE_MS) return cached

    await setProgress({ phase: 'login', message: 'e-amusement 로그인을 확인하는 중입니다.', percent: 2 })
    const login = await checkLoginIn(tabId)
    await writeLogin(login)

    if (!login.isLoggedIn) throw new Error('e-amusement에 로그인되어 있지 않습니다. 브라우저에서 로그인한 뒤 다시 시도해 주세요.')

    return login
}

const collectPlayerAndRadar = async (tabId: number, style: 0 | 1) => {
    await setProgress({ phase: 'player', message: 'DJ 정보를 읽는 중입니다.', percent: 6 })
    await navigate(tabId, EAGATE_URLS.status)

    const response = await requestExtract(tabId, { type: 'EXTRACT', kind: 'STATUS' })
    if (!response.ok) throw new Error(response.error)

    const status = response.payload.status as { player: Dataset['player']; notesRadar: Dataset['notesRadar'] } | null
    if (status === null) throw new Error('DJ 정보를 해석하지 못했습니다.')

    await setProgress({ phase: 'radar', message: '플레이어 노트레이더를 읽는 중입니다.', percent: 10 })
    await navigate(tabId, EAGATE_URLS.notesRadar)

    const payload = await fetchRadarJson(tabId, style)
    if (payload !== null) {
        const radarResponse = await requestExtract(tabId, { type: 'EXTRACT', kind: 'RADAR', style })
        if (radarResponse.ok && radarResponse.payload.radar !== null) {
            const radar = radarResponse.payload.radar as Dataset['notesRadar']
            if (radar !== null && Object.values(radar.values).some((value) => value !== null)) return { player: status.player, notesRadar: radar }
        }
    }

    const fallback = await requestExtract(tabId, { type: 'EXTRACT', kind: 'RADAR', style })
    const radar = fallback.ok ? (fallback.payload.radar as Dataset['notesRadar']) : null

    return { player: status.player, notesRadar: radar ?? status.notesRadar }
}

const collectCharts = async (tabId: number, settings: Settings) => {
    const levels = settings.levels.toSorted((a, b) => b - a)
    const delayProfile = DELAY_PROFILES[settings.delayProfile]
    const charts: Chart[] = []
    const warnings: string[] = []
    const failedLevels: number[] = []
    const totalPages = Math.max(1, levels.length * DIFFICULTY_PAGE_ESTIMATE)
    let pagesFetched = 0

    for (const level of levels) {
        let offset = 0
        let page = 0
        let reachedEnd = false
        let levelFailed = false

        while (page < DIFFICULTY_MAX_PAGES_PER_LEVEL && !reachedEnd) {
            if (runState.cancelled) throw new Error(COLLECTION_CANCELLED)

            const url = `${EAGATE_ORIGIN}${GAME_BASE_PATH}/djdata/music/difficulty.html?difficult=${level - 1}&style=${settings.style}&disp=1&offset=${offset}`
            await setProgress({
                phase: 'charts',
                message: `LEVEL ${level} · ${page + 1}페이지 (offset ${offset})`,
                percent: Math.min(96, 12 + (pagesFetched / totalPages) * 84),
                chartCount: charts.length,
                pagesFetched,
            })

            await navigate(tabId, url)
            const response = await requestExtract(tabId, { type: 'EXTRACT', kind: 'DIFFICULTY', level, style: settings.style })

            if (!response.ok) {
                warnings.push(`LEVEL ${level} offset ${offset}: ${response.error}`)
                failedLevels.push(level)
                levelFailed = true
                break
            }

            const difficulty = response.payload.difficulty
            if (difficulty === null) {
                warnings.push(`LEVEL ${level} offset ${offset}: 페이지를 해석하지 못했습니다.`)
                failedLevels.push(level)
                levelFailed = true
                break
            }

            if (difficulty.requiresLogin) throw new Error('e-amusement 로그인이 만료되었습니다. 다시 로그인해 주세요.')

            const pageCharts = difficulty.charts as Array<Omit<Chart, 'chartId'>>
            const identified = await Promise.all(
                pageCharts.map(async (chart) => ({ ...chart, chartId: await chartIdFrom(chart.title, chart.difficulty) })),
            )

            charts.push(...identified)
            pagesFetched += 1
            page += 1

            if (difficulty.isNoData || pageCharts.length === 0) reachedEnd = true
            else if (pageCharts.length < DIFFICULTY_OFFSET_STEP) reachedEnd = true
            else {
                offset += DIFFICULTY_OFFSET_STEP
                await waitRandom(delayProfile.minMs, delayProfile.maxMs)
            }
        }

        if (levelFailed) continue
        if (!reachedEnd && page >= DIFFICULTY_MAX_PAGES_PER_LEVEL)
            warnings.push(`LEVEL ${level}: 페이지 상한(${DIFFICULTY_MAX_PAGES_PER_LEVEL})에 도달해 일부만 수집했습니다.`)
    }

    return { charts, pagesFetched, warnings, failedLevels }
}

const runCollection = async (settings: Settings) => {
    runState.cancelled = false
    let tabId: number | null = null

    try {
        const startedAt = new Date().toISOString()
        await writeCollection({
            status: 'running',
            runId: crypto.randomUUID(),
            phase: 'login',
            message: '수집을 시작합니다.',
            percent: 0,
            startedAt,
            finishedAt: null,
            error: null,
            warnings: [],
            chartCount: 0,
            pagesFetched: 0,
        })

        tabId = await openCollectionTab()
        await waitForLoad(tabId, EAGATE_URLS.index, 25_000)
        await ensureLoggedIn(tabId)

        const { player, notesRadar } = await collectPlayerAndRadar(tabId, settings.style)
        const { charts, pagesFetched, warnings, failedLevels } = await collectCharts(tabId, settings)
        const finishedAt = new Date().toISOString()

        const dataset = DatasetSchema.parse({
            format: DATASET_FORMAT,
            schemaVersion: DATASET_SCHEMA_VERSION,
            gameVersion: GAME_VERSION,
            player,
            notesRadar,
            charts,
            meta: {
                status: charts.length === 0 ? 'empty' : warnings.length === 0 ? 'complete' : 'partial',
                generatedAt: finishedAt,
                finishedAt,
                gameVersion: GAME_VERSION,
                style: settings.style,
                levels: settings.levels,
                delay: { minMs: DELAY_PROFILES[settings.delayProfile].minMs, maxMs: DELAY_PROFILES[settings.delayProfile].maxMs },
                pagesFetched,
                failedLevels,
                warnings,
            },
        })

        await writeDataset(dataset)
        await setProgress({
            status: 'completed',
            phase: 'done',
            message: `${dataset.charts.length}개 차트 데이터를 저장했습니다.`,
            percent: 100,
            chartCount: dataset.charts.length,
            pagesFetched,
            warnings,
            finishedAt,
        })
    } catch (error) {
        const cancelled = error instanceof Error && error.message === COLLECTION_CANCELLED
        const message = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.'

        await setProgress({
            status: cancelled ? 'cancelled' : 'failed',
            phase: cancelled ? 'idle' : 'failed',
            message: cancelled ? '수집을 중단했습니다.' : `수집 실패: ${message}`,
            error: cancelled ? null : message,
            finishedAt: new Date().toISOString(),
        })
    } finally {
        if (tabId !== null) await closeCollectionTab(tabId)
    }
}

const buildOverview = async (): Promise<Overview> => {
    const [login, collection, settings, dataset] = await Promise.all([readLogin(), readCollection(), readSettings(), readDataset()])

    return {
        login,
        collection,
        settings,
        dataset:
            dataset === null
                ? null
                : {
                      status: dataset.meta.status,
                      chartCount: dataset.charts.length,
                      generatedAt: dataset.meta.generatedAt,
                      djName: dataset.player?.djName ?? null,
                      notesRadar: dataset.notesRadar,
                  },
    }
}

const stampOf = (iso: string | null) => (iso ?? new Date().toISOString()).replace(/[:.]/g, '-')

const handle = async (message: BackgroundRequest): Promise<BackgroundResponse> => {
    switch (message.type) {
        case 'GET_OVERVIEW':
            return { ok: true, data: await buildOverview() }

        case 'UPDATE_SETTINGS':
            await writeSettings(message.settings)
            return { ok: true, data: await buildOverview() }

        case 'CHECK_LOGIN': {
            try {
                const login = await checkLoginState()
                await writeLogin(login)
            } catch {
                await writeLogin({
                    isLoggedIn: false,
                    communityNickname: null,
                    djName: null,
                    checkedAt: new Date().toISOString(),
                    pageUrl: EAGATE_URLS.index,
                })
            }

            return { ok: true, data: await buildOverview() }
        }

        case 'START_COLLECTION': {
            const current = await readCollection()
            if (current.status === 'running') return { ok: false, error: '이미 수집이 진행 중입니다.' }
            if (message.settings.levels.length === 0) return { ok: false, error: '수집할 레벨을 하나 이상 선택해 주세요.' }

            const invalid = message.settings.levels.find((level) => level < LEVEL_MIN || level > LEVEL_MAX)
            if (invalid !== undefined) return { ok: false, error: `지원하지 않는 레벨입니다: ${invalid}` }

            await writeSettings(message.settings)
            void runCollection(message.settings)
            return { ok: true, data: null }
        }

        case 'CANCEL_COLLECTION': {
            runState.cancelled = true
            const tabId = await readCollectionTabId()
            if (tabId !== null) await closeCollectionTab(tabId)
            return { ok: true, data: null }
        }

        case 'CLEAR_DATA':
            await clearDataset()
            return { ok: true, data: await buildOverview() }

        case 'EXPORT_DATASET': {
            const dataset = await readDataset()
            if (dataset === null) return { ok: false, error: '내보낼 데이터가 없습니다.' }

            return {
                ok: true,
                data: {
                    download: {
                        filename: `${EXPORT_FILE_PREFIX}-dataset-v1-${stampOf(dataset.meta.generatedAt)}.json`,
                        content: JSON.stringify(dataset, null, 2),
                    },
                },
            }
        }

        case 'EXPORT_RANK_IMPORT': {
            const dataset = await readDataset()
            if (dataset === null) return { ok: false, error: '내보낼 데이터가 없습니다.' }

            return {
                ok: true,
                data: {
                    download: {
                        filename: `${EXPORT_FILE_PREFIX}-rank-import-v1-${stampOf(dataset.meta.generatedAt)}.json`,
                        content: JSON.stringify(toRankImport(dataset), null, 2),
                    },
                },
            }
        }
    }
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if (typeof message !== 'object' || message === null || !('type' in message)) return false

    handle(message as BackgroundRequest)
        .then((response) => sendResponse(response))
        .catch((error: unknown) => sendResponse({ ok: false, error: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.' }))

    return true
})
