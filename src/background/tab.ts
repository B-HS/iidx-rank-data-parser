import { EAGATE_URLS, EXTRACT_ATTEMPTS, EXTRACT_RETRY_DELAY_MS, PAGE_LOAD_TIMEOUT_MS, TAB_SETTLE_DELAY_MS } from '@shared/constants'
import type { FlowFailure } from '@shared/domain'
import { ExtractResponseSchema } from '@shared/messages'
import type { ExtractRequest, ExtractSuccess } from '@shared/messages'
import { writeCollectionTabId } from '@shared/storage'
import { createFlowError } from '@core/flow-error'

type LoadExpectation = {
    tabId: number
    url: string
    signal: AbortSignal
    acceptsCurrentDocument: boolean
}

export const wait = (ms: number, signal: AbortSignal) =>
    new Promise<void>((resolve, reject) => {
        if (signal.aborted) {
            reject(createFlowError('aborted'))
            return
        }

        const handleAbort = () => {
            clearTimeout(timer)
            reject(createFlowError('aborted'))
        }
        const timer = setTimeout(() => {
            signal.removeEventListener('abort', handleAbort)
            resolve()
        }, ms)

        signal.addEventListener('abort', handleAbort, { once: true })
    })

export const waitRandom = (minMs: number, maxMs: number, signal: AbortSignal) => wait(minMs + Math.random() * (maxMs - minMs), signal)

export const sameLocation = (candidate: string | undefined, target: string) => {
    if (candidate === undefined) return false

    try {
        const from = new URL(candidate)
        const to = new URL(target)

        return from.pathname === to.pathname && from.search === to.search
    } catch {
        return false
    }
}

export const openCollectionTab = async () => {
    const tab = await chrome.tabs.create({ url: EAGATE_URLS.index, active: true }).catch(() => null)
    if (tab === null || tab.id === undefined) throw createFlowError('tab_open_failed')

    await writeCollectionTabId(tab.id)
    return tab.id
}

export const closeCollectionTab = async (tabId: number) => {
    await writeCollectionTabId(null)
    await chrome.tabs.remove(tabId).catch(() => undefined)
}

/**
 * Waits until the tab finishes loading the expected URL.
 * Rejects right away when the tab is closed, the run is aborted, or the tab
 * finishes loading a different page, instead of waiting for the timeout.
 * Without the `tabs` permission the tab URL is only readable on hosts listed
 * in `host_permissions`, so a finished load with an unreadable URL counts as
 * a different page.
 */
export const waitForLoad = ({ tabId, url, signal, acceptsCurrentDocument }: LoadExpectation) =>
    new Promise<void>((resolve, reject) => {
        let isSettled = false

        const finish = (failure: FlowFailure | null) => {
            if (isSettled) return
            isSettled = true
            chrome.tabs.onUpdated.removeListener(handleUpdated)
            chrome.tabs.onRemoved.removeListener(handleRemoved)
            signal.removeEventListener('abort', handleAbort)
            clearTimeout(timer)
            if (failure === null) resolve()
            else reject(createFlowError(failure))
        }

        const handleUpdated = (changedTabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => {
            if (changedTabId !== tabId || changeInfo.status !== 'complete') return
            finish(sameLocation(tab.url, url) ? null : 'url_mismatch')
        }
        const handleRemoved = (removedTabId: number) => {
            if (removedTabId === tabId) finish('tab_closed')
        }
        const handleAbort = () => finish('aborted')
        const timer = setTimeout(() => finish('load_timeout'), PAGE_LOAD_TIMEOUT_MS)

        if (signal.aborted) {
            finish('aborted')
            return
        }

        chrome.tabs.onUpdated.addListener(handleUpdated)
        chrome.tabs.onRemoved.addListener(handleRemoved)
        signal.addEventListener('abort', handleAbort, { once: true })

        if (!acceptsCurrentDocument) return

        chrome.tabs
            .get(tabId)
            .then((tab) => {
                if (tab.status === 'complete' && sameLocation(tab.url, url)) setTimeout(() => finish(null), TAB_SETTLE_DELAY_MS)
            })
            .catch(() => finish('tab_closed'))
    })

/**
 * Moves the collection tab to a URL and waits for the new document.
 * The load listener is attached before the navigation starts so a reload of
 * the same URL cannot be mistaken for the already loaded document.
 */
export const navigate = async (tabId: number, url: string, signal: AbortSignal) => {
    const current = await chrome.tabs.get(tabId).catch(() => null)
    if (current === null) throw createFlowError('tab_closed')

    const loaded = waitForLoad({ tabId, url, signal, acceptsCurrentDocument: false })
    const started = current.url === url ? chrome.tabs.reload(tabId) : chrome.tabs.update(tabId, { url, active: true })

    await Promise.all([loaded, started.catch(() => Promise.reject(createFlowError('tab_closed')))])
}

/**
 * Asks the content script of the collection tab to parse the current page.
 * The response is validated before use, and an unanswered or malformed
 * response is retried a few times because the script loads at document idle.
 */
export const requestExtract = async (tabId: number, request: ExtractRequest, signal: AbortSignal): Promise<ExtractSuccess> => {
    for (let attempt = 0; attempt < EXTRACT_ATTEMPTS; attempt += 1) {
        const raw: unknown = await chrome.tabs.sendMessage(tabId, request).catch(() => null)
        const parsed = ExtractResponseSchema.safeParse(raw)

        if (parsed.success && parsed.data.ok) return parsed.data
        if (parsed.success) throw createFlowError('extract_failed')

        await wait(EXTRACT_RETRY_DELAY_MS, signal)
    }

    throw createFlowError('no_response')
}
