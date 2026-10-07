import {
    CONSECUTIVE_LEVEL_FAILURE_LIMIT,
    DELAY_PROFILES,
    DIFFICULTY_DISP,
    DIFFICULTY_MAX_PAGES_PER_LEVEL,
    DIFFICULTY_OFFSET_STEP,
    DIFFICULTY_PAGE_ATTEMPTS,
    DIFFICULTY_PAGE_ESTIMATE,
    EAGATE_URLS,
    LOGIN_STATE_MAX_AGE_MS,
    PROGRESS_PERCENT,
} from '@shared/constants'
import { LEVEL_FAILURES, RETRYABLE_PAGE_FAILURES, RUN_ABORT_FAILURES } from '@shared/domain'
import type { FlowFailure, LevelFailure, RetryablePageFailure, RunAbortFailure } from '@shared/domain'
import { toMessage } from '@shared/message-keys'
import type { LocalizedMessage } from '@shared/message-keys'
import type { Chart, CollectionState, DifficultyPage, LoginState, NotesRadar, Player, Settings } from '@shared/schema'
import { readCollection, readLogin, writeCollection, writeDataset, writeLogin } from '@shared/storage'
import { chartIdFrom } from '@core/chart-id'
import { classifyDifficultyPage, pickNotesRadar } from '@core/collection-flow'
import { buildDataset } from '@core/dataset-builder'
import { createFlowError, flowFailureOf, messageOfError } from '@core/flow-error'
import { releaseRun, runState } from './run-state'
import type { ActiveRun } from './run-state'
import { closeCollectionTab, navigate, openCollectionTab, requestExtract, sameLocation, waitForLoad, waitRandom } from './tab'

type PageFetch = { ok: true; page: DifficultyPage; isLastPage: boolean } | { ok: false; failure: FlowFailure }

type LevelEnd = { kind: 'complete' } | { kind: 'failed' } | { kind: 'aborted'; failure: RunAbortFailure }

type LevelResult = {
    charts: Chart[]
    pagesFetched: number
    warnings: LocalizedMessage[]
    end: LevelEnd
}

type ChartCollection = {
    charts: Chart[]
    pagesFetched: number
    warnings: LocalizedMessage[]
    failedLevels: number[]
    abortedBy: RunAbortFailure | null
}

type CollectionTotals = Pick<ChartCollection, 'charts' | 'pagesFetched'>

const SAVED_MESSAGE_KEY = {
    complete: 'progress_saved',
    partial: 'progress_saved_partial',
} as const

const isRetryablePageFailure = (failure: FlowFailure): failure is RetryablePageFailure =>
    RETRYABLE_PAGE_FAILURES.some((candidate) => candidate === failure)

const isLevelFailure = (failure: FlowFailure): failure is LevelFailure => LEVEL_FAILURES.some((candidate) => candidate === failure)

const isRunAbortFailure = (failure: FlowFailure): failure is RunAbortFailure => RUN_ABORT_FAILURES.some((candidate) => candidate === failure)

const isFatalForOptionalStep = (failure: FlowFailure | null) => failure === null || failure === 'aborted' || isRunAbortFailure(failure)

const uniqueByChartId = (charts: Chart[]) => {
    const seenChartIds = new Set<string>()

    return charts.filter((chart) => {
        if (seenChartIds.has(chart.chartId)) return false
        seenChartIds.add(chart.chartId)
        return true
    })
}

const uniqueLevels = (levels: number[]) => Array.from(new Set(levels))

const setProgress = async (run: ActiveRun, patch: Partial<CollectionState>) => {
    if (runState.active !== run) return

    const current = await readCollection()
    if (current.runId !== run.runId) return

    await writeCollection({ ...current, ...patch, updatedAt: new Date().toISOString() })
}

const difficultyPageUrl = (level: number, style: Settings['style'], offset: number) =>
    `${EAGATE_URLS.difficulty}?difficult=${level - 1}&style=${style}&disp=${DIFFICULTY_DISP}&offset=${offset}`

const checkLoginIn = async (tabId: number, signal: AbortSignal): Promise<LoginState> => {
    await waitForLoad({ tabId, url: EAGATE_URLS.index, signal, acceptsCurrentDocument: true })
    const response = await requestExtract(tabId, { type: 'EXTRACT', kind: 'LOGIN' }, signal)
    if (response.kind !== 'LOGIN') throw createFlowError('login_unreadable')

    return {
        isLoggedIn: response.login.isLoggedIn,
        communityNickname: response.login.communityNickname,
        djName: response.login.djName,
        checkedAt: new Date().toISOString(),
        pageUrl: response.url,
        error: null,
    }
}

/**
 * Opens the e-amusement top page once and stores the detected login state.
 * A failed check is stored with its error so it is not shown as "logged out".
 */
export const checkLoginState = async (run: ActiveRun) => {
    let tabId: number | null = null

    try {
        tabId = await openCollectionTab()
        await writeLogin(await checkLoginIn(tabId, run.controller.signal))
    } catch (error) {
        await writeLogin({
            isLoggedIn: false,
            communityNickname: null,
            djName: null,
            checkedAt: new Date().toISOString(),
            pageUrl: EAGATE_URLS.index,
            error: messageOfError(error),
        })
    } finally {
        if (tabId !== null) await closeCollectionTab(tabId)
        releaseRun(run)
    }
}

const ensureLoggedIn = async (run: ActiveRun, tabId: number) => {
    const signal = run.controller.signal
    const cached = await readLogin()
    const isCachedFresh = cached !== null && cached.isLoggedIn && Date.now() - Date.parse(cached.checkedAt) < LOGIN_STATE_MAX_AGE_MS

    if (isCachedFresh) {
        await waitForLoad({ tabId, url: EAGATE_URLS.index, signal, acceptsCurrentDocument: true })
        return
    }

    await setProgress(run, { phase: 'login', message: toMessage('progress_login'), percent: PROGRESS_PERCENT.login })
    const login = await checkLoginIn(tabId, signal)
    await writeLogin(login)

    if (!login.isLoggedIn) throw createFlowError('not_logged_in')
}

const attemptOptionalStep = async <T>(step: () => Promise<T>) => {
    try {
        return await step()
    } catch (error) {
        if (isFatalForOptionalStep(flowFailureOf(error))) throw error
        return null
    }
}

const collectPlayerAndRadar = async (run: ActiveRun, tabId: number): Promise<{ player: Player | null; notesRadar: NotesRadar | null }> => {
    const signal = run.controller.signal

    await setProgress(run, { phase: 'player', message: toMessage('progress_player'), percent: PROGRESS_PERCENT.player })
    const status = await attemptOptionalStep(async () => {
        await navigate(tabId, EAGATE_URLS.status, signal)
        const response = await requestExtract(tabId, { type: 'EXTRACT', kind: 'STATUS' }, signal)
        if (response.kind !== 'STATUS') throw createFlowError('extract_failed')
        if (response.requiresLogin) throw createFlowError('session_expired')

        return sameLocation(response.url, EAGATE_URLS.status) ? response : null
    })

    await setProgress(run, { phase: 'radar', message: toMessage('progress_radar'), percent: PROGRESS_PERCENT.radar })
    const radar = await attemptOptionalStep(async () => {
        await navigate(tabId, EAGATE_URLS.notesRadar, signal)
        const response = await requestExtract(tabId, { type: 'EXTRACT', kind: 'RADAR' }, signal)

        return response.kind === 'RADAR' && sameLocation(response.url, EAGATE_URLS.notesRadar) ? response.notesRadar : null
    })

    return { player: status?.player ?? null, notesRadar: pickNotesRadar([radar, status?.notesRadar ?? null]) }
}

const fetchDifficultyPage = async (tabId: number, url: string, level: number, style: Settings['style'], signal: AbortSignal) => {
    await navigate(tabId, url, signal)
    const response = await requestExtract(tabId, { type: 'EXTRACT', kind: 'DIFFICULTY', level, style }, signal)
    if (response.kind !== 'DIFFICULTY') throw createFlowError('extract_failed')
    if (!sameLocation(response.url, url)) throw createFlowError('url_mismatch')

    const outcome = classifyDifficultyPage(response.difficulty, DIFFICULTY_OFFSET_STEP)
    if (outcome === 'login_required') throw createFlowError('session_expired')
    if (outcome === 'unexpected_page') throw createFlowError('unexpected_page')

    return { page: response.difficulty, isLastPage: outcome === 'end' }
}

const fetchDifficultyPageWithRetry = async (run: ActiveRun, tabId: number, settings: Settings, level: number, offset: number): Promise<PageFetch> => {
    const signal = run.controller.signal
    const delay = DELAY_PROFILES[settings.delayProfile]
    const url = difficultyPageUrl(level, settings.style, offset)

    for (let attempt = 1; attempt <= DIFFICULTY_PAGE_ATTEMPTS; attempt += 1) {
        try {
            return { ok: true, ...(await fetchDifficultyPage(tabId, url, level, settings.style, signal)) }
        } catch (error) {
            const failure = flowFailureOf(error)
            if (run.isCancelled || failure === null || failure === 'aborted') throw error
            if (!isRetryablePageFailure(failure) || attempt === DIFFICULTY_PAGE_ATTEMPTS) return { ok: false, failure }

            await waitRandom(delay.minMs, delay.maxMs, signal)
        }
    }

    return { ok: false, failure: 'no_response' }
}

const collectLevel = async (run: ActiveRun, tabId: number, settings: Settings, level: number, totals: CollectionTotals, totalPages: number) => {
    const delay = DELAY_PROFILES[settings.delayProfile]
    let result: Omit<LevelResult, 'end'> = { charts: [], pagesFetched: 0, warnings: [] }

    for (let page = 0; page < DIFFICULTY_MAX_PAGES_PER_LEVEL; page += 1) {
        const offset = page * DIFFICULTY_OFFSET_STEP
        const pagesFetched = totals.pagesFetched + result.pagesFetched
        const progressSpan = PROGRESS_PERCENT.chartsEnd - PROGRESS_PERCENT.chartsStart

        await setProgress(run, {
            phase: 'charts',
            message: toMessage('progress_charts', { level, page: page + 1, offset }),
            percent: Math.min(PROGRESS_PERCENT.chartsEnd, PROGRESS_PERCENT.chartsStart + (pagesFetched / totalPages) * progressSpan),
            chartCount: totals.charts.length + result.charts.length,
            pagesFetched,
        })

        const fetched = await fetchDifficultyPageWithRetry(run, tabId, settings, level, offset)

        if (!fetched.ok && isRunAbortFailure(fetched.failure))
            return { ...result, end: { kind: 'aborted', failure: fetched.failure } } satisfies LevelResult
        if (!fetched.ok) {
            const failure = isLevelFailure(fetched.failure) ? fetched.failure : 'no_response'
            const warning = toMessage(`warning_page_${failure}`, { level, offset })

            return { ...result, warnings: [...result.warnings, warning], end: { kind: 'failed' } } satisfies LevelResult
        }

        const identified = await Promise.all(
            fetched.page.charts.map(async (chart) => ({ ...chart, chartId: await chartIdFrom(chart.title, chart.difficulty) })),
        )
        const isFirstPageEmpty = page === 0 && fetched.page.rowCount === 0

        result = {
            charts: [...result.charts, ...identified],
            pagesFetched: result.pagesFetched + 1,
            warnings: [
                ...result.warnings,
                ...(fetched.page.skippedRowCount === 0
                    ? []
                    : [toMessage('warning_page_rows_skipped', { level, offset, count: fetched.page.skippedRowCount })]),
                ...(isFirstPageEmpty ? [toMessage('warning_level_first_page_empty', { level })] : []),
            ],
        }

        if (fetched.isLastPage) return { ...result, end: { kind: 'complete' } } satisfies LevelResult

        await waitRandom(delay.minMs, delay.maxMs, run.controller.signal)
    }

    const limitWarning = toMessage('warning_level_page_limit', { level, limit: DIFFICULTY_MAX_PAGES_PER_LEVEL })
    return { ...result, warnings: [...result.warnings, limitWarning], end: { kind: 'complete' } } satisfies LevelResult
}

const resolveAbort = (end: LevelEnd, consecutiveFailures: number): RunAbortFailure | null => {
    if (end.kind === 'aborted') return end.failure

    return consecutiveFailures >= CONSECUTIVE_LEVEL_FAILURE_LIMIT ? 'repeated_failures' : null
}

const collectCharts = async (run: ActiveRun, tabId: number, settings: Settings): Promise<ChartCollection> => {
    const levels = settings.levels.toSorted((a, b) => b - a)
    const totalPages = Math.max(1, levels.length * DIFFICULTY_PAGE_ESTIMATE)
    let collection: ChartCollection = { charts: [], pagesFetched: 0, warnings: [], failedLevels: [], abortedBy: null }
    let consecutiveFailures = 0

    for (const [index, level] of levels.entries()) {
        const result = await collectLevel(run, tabId, settings, level, collection, totalPages)
        const isLevelIncomplete = result.end.kind !== 'complete'

        consecutiveFailures = isLevelIncomplete ? consecutiveFailures + 1 : 0
        collection = {
            charts: uniqueByChartId([...collection.charts, ...result.charts]),
            pagesFetched: collection.pagesFetched + result.pagesFetched,
            warnings: [...collection.warnings, ...result.warnings],
            failedLevels: isLevelIncomplete ? [...collection.failedLevels, level] : collection.failedLevels,
            abortedBy: null,
        }

        const abortedBy = resolveAbort(result.end, consecutiveFailures)
        const remaining = levels.slice(index + 1)
        const uncollected = result.end.kind === 'aborted' ? [level, ...remaining] : remaining

        if (abortedBy !== null && uncollected.length > 0) {
            return {
                ...collection,
                warnings: [...collection.warnings, toMessage(`warning_aborted_${abortedBy}`, { levels: uncollected.join(', ') })],
                failedLevels: uniqueLevels([...collection.failedLevels, ...uncollected]),
                abortedBy,
            }
        }
    }

    return collection
}

const failRun = async (run: ActiveRun, error: unknown) => {
    const finishedAt = new Date().toISOString()

    if (run.isCancelled) {
        await setProgress(run, { status: 'cancelled', phase: 'idle', message: toMessage('progress_cancelled'), error: null, finishedAt })
        return
    }

    await setProgress(run, { status: 'failed', phase: 'failed', message: toMessage('progress_failed'), error: messageOfError(error), finishedAt })
}

/**
 * Runs one collection from login check to dataset storage.
 * @param run - lock holder created synchronously by the message handler
 * @param settings - validated collection settings
 * @returns whether a dataset was stored
 */
export const runCollection = async (run: ActiveRun, settings: Settings) => {
    let tabId: number | null = null

    try {
        const startedAt = new Date().toISOString()
        await writeCollection({
            status: 'running',
            runId: run.runId,
            phase: 'login',
            message: toMessage('progress_starting'),
            percent: PROGRESS_PERCENT.start,
            startedAt,
            updatedAt: startedAt,
            finishedAt: null,
            error: null,
            warnings: [],
            chartCount: 0,
            pagesFetched: 0,
            datasetStatus: null,
        })

        tabId = await openCollectionTab()
        await ensureLoggedIn(run, tabId)

        const { player, notesRadar } = await collectPlayerAndRadar(run, tabId)
        const collected = await collectCharts(run, tabId, settings)

        if (run.isCancelled) throw createFlowError('aborted')
        if (collected.charts.length === 0 && collected.failedLevels.length > 0) {
            await setProgress(run, { warnings: collected.warnings })
            throw createFlowError(collected.abortedBy ?? 'all_levels_failed')
        }

        const dataset = buildDataset(player, notesRadar, collected.charts, settings, collected)
        const chartCount = dataset.charts.length

        await writeDataset(dataset)
        await setProgress(run, {
            status: 'completed',
            phase: 'done',
            message:
                dataset.meta.status === 'empty'
                    ? toMessage('progress_saved_empty')
                    : toMessage(SAVED_MESSAGE_KEY[dataset.meta.status], { count: chartCount }),
            percent: PROGRESS_PERCENT.done,
            chartCount,
            pagesFetched: dataset.meta.pagesFetched,
            warnings: dataset.meta.warnings,
            finishedAt: dataset.meta.finishedAt,
            datasetStatus: dataset.meta.status,
        })

        return true
    } catch (error) {
        await failRun(run, error).catch(() => undefined)
        return false
    } finally {
        if (tabId !== null) await closeCollectionTab(tabId).catch(() => undefined)
        releaseRun(run)
    }
}
