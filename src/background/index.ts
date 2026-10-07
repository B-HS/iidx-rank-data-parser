import { COLLECTION_STALE_MS, DATASET_SCHEMA_VERSION, EXPORT_FILE_PREFIX } from '@shared/constants'
import { toMessage } from '@shared/message-keys'
import { BackgroundEnvelopeSchema, BackgroundRequestSchema } from '@shared/messages'
import type { BackgroundRequest, BackgroundResponse, Overview } from '@shared/messages'
import { RANK_ORIGIN } from '@shared/rank-origin'
import { RANK_IMPORT_VERSION } from '@shared/rank-schema'
import {
    clearDataset,
    readCollection,
    readCollectionTabId,
    readDataset,
    readLogin,
    readRankSession,
    readRankSync,
    readSettings,
    removeLegacyValues,
    writeCollection,
    writeSettings,
} from '@shared/storage'
import { isCollectionStale } from '@core/collection-flow'
import { messageOfError } from '@core/flow-error'
import { toRankImport } from '@core/rank-export'
import { checkLoginState, runCollection } from './collection'
import { openRankLogin, refreshRankSession, runRankSync } from './rank'
import { createRun, releaseRun, runState } from './run-state'
import { closeCollectionTab } from './tab'

const BUSY_RESPONSE: BackgroundResponse = { ok: false, error: toMessage('error_busy') }
const NO_DATASET_RESPONSE: BackgroundResponse = { ok: false, error: toMessage('error_no_dataset') }

const reconcileCollection = async () => {
    const stored = await readCollection()
    if (stored.status !== 'running') return stored

    const run = runState.active
    const isAlive = run !== null && run.runId === stored.runId && !isCollectionStale(stored, Date.now(), COLLECTION_STALE_MS)
    if (isAlive) return stored

    if (run !== null && run.runId === stored.runId) {
        runState.active = null
        run.controller.abort()
    }

    const finishedAt = new Date().toISOString()
    const interrupted = {
        ...stored,
        status: 'failed',
        phase: 'failed',
        message: toMessage('progress_failed'),
        error: toMessage('error_interrupted'),
        updatedAt: finishedAt,
        finishedAt,
    } satisfies typeof stored

    await writeCollection(interrupted)

    const tabId = await readCollectionTabId()
    if (tabId !== null) await closeCollectionTab(tabId)

    return interrupted
}

const startup = Promise.all([removeLegacyValues(), reconcileCollection()]).catch(() => undefined)

const buildOverview = async (): Promise<Overview> => {
    const [login, collection, settings, dataset, session, lastSync] = await Promise.all([
        readLogin(),
        reconcileCollection(),
        readSettings(),
        readDataset(),
        readRankSession(),
        readRankSync(),
    ])

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
                      style: dataset.meta.style,
                      djName: dataset.player?.djName ?? null,
                      notesRadar: dataset.notesRadar,
                  },
        rank: { origin: RANK_ORIGIN, session, lastSync, isSyncing: runState.isSyncing },
    }
}

const stampOf = (iso: string | null) => (iso ?? new Date().toISOString()).replace(/[:.]/g, '-')

const startCollection = async (settings: Extract<BackgroundRequest, { type: 'START_COLLECTION' }>['settings']) => {
    await reconcileCollection()
    if (runState.active !== null) return BUSY_RESPONSE

    const run = createRun()
    runState.active = run

    try {
        await writeSettings(settings)
    } catch (error) {
        releaseRun(run)
        throw error
    }

    void runCollection(run, settings)
        .then((isStored) => (isStored ? runRankSync('auto') : false))
        .catch(() => undefined)

    return { ok: true, data: null } satisfies BackgroundResponse
}

const handle = async (message: BackgroundRequest): Promise<BackgroundResponse> => {
    await startup

    switch (message.type) {
        case 'GET_OVERVIEW':
            return { ok: true, data: await buildOverview() }

        case 'UPDATE_SETTINGS':
            await writeSettings(message.settings)
            return { ok: true, data: await buildOverview() }

        case 'CHECK_LOGIN': {
            await reconcileCollection()
            if (runState.active !== null) return BUSY_RESPONSE

            const run = createRun()
            runState.active = run
            await checkLoginState(run)

            return { ok: true, data: await buildOverview() }
        }

        case 'START_COLLECTION':
            return startCollection(message.settings)

        case 'CANCEL_COLLECTION': {
            const run = runState.active
            if (run !== null) {
                run.isCancelled = true
                run.controller.abort()
            }

            const tabId = await readCollectionTabId()
            if (tabId !== null) await closeCollectionTab(tabId)
            if (run === null) await reconcileCollection()

            return { ok: true, data: null }
        }

        case 'CLEAR_DATA':
            await reconcileCollection()
            if (runState.active !== null) return BUSY_RESPONSE

            await clearDataset()
            return { ok: true, data: await buildOverview() }

        case 'EXPORT_DATASET': {
            const dataset = await readDataset()
            if (dataset === null) return NO_DATASET_RESPONSE

            return {
                ok: true,
                data: {
                    download: {
                        filename: `${EXPORT_FILE_PREFIX}-dataset-v${DATASET_SCHEMA_VERSION}-${stampOf(dataset.meta.generatedAt)}.json`,
                        content: JSON.stringify(dataset, null, 2),
                    },
                },
            }
        }

        case 'EXPORT_RANK_IMPORT': {
            const dataset = await readDataset()
            if (dataset === null) return NO_DATASET_RESPONSE

            return {
                ok: true,
                data: {
                    download: {
                        filename: `${EXPORT_FILE_PREFIX}-rank-import-v${RANK_IMPORT_VERSION}-${stampOf(dataset.meta.generatedAt)}.json`,
                        content: JSON.stringify(toRankImport(dataset), null, 2),
                    },
                },
            }
        }

        case 'CHECK_RANK_SESSION':
            await refreshRankSession()
            return { ok: true, data: await buildOverview() }

        case 'SYNC_RANK': {
            if (runState.active !== null) return BUSY_RESPONSE

            const hasRun = await runRankSync('manual')
            return hasRun ? { ok: true, data: await buildOverview() } : BUSY_RESPONSE
        }

        case 'OPEN_RANK_LOGIN':
            await openRankLogin()
            return { ok: true, data: null }
    }
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if (!BackgroundEnvelopeSchema.safeParse(message).success) return false

    const request = BackgroundRequestSchema.safeParse(message)
    if (!request.success) {
        sendResponse({ ok: false, error: toMessage('error_invalid_request') } satisfies BackgroundResponse)
        return false
    }

    handle(request.data)
        .then((response) => sendResponse(response))
        .catch((error: unknown) => sendResponse({ ok: false, error: messageOfError(error) } satisfies BackgroundResponse))

    return true
})
