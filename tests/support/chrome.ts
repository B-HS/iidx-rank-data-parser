export type StubTab = Pick<chrome.tabs.Tab, 'id' | 'status' | 'url'>

type UpdatedListener = (tabId: number, changeInfo: Pick<chrome.tabs.TabChangeInfo, 'status'>, tab: StubTab) => void

type RemovedListener = (tabId: number) => void

type TabsStubOptions = {
    tabId: number
    readableUrlOf?: (requestedUrl: string) => string | undefined
    respond?: (request: unknown, tab: StubTab | null) => unknown
}

type StorageAreaOptions = {
    initial?: Record<string, unknown>
    rejectedKeys?: string[]
}

/**
 * Builds a chrome.tabs stand-in that drives one tab.
 * A navigation finishes on the next task and reports the URL the extension
 * can read, which is undefined on a host outside host_permissions when the
 * extension has no `tabs` permission.
 * @param options - tab id, the readable URL per requested URL, and the content script reply
 */
export const createTabsStub = ({ tabId, readableUrlOf = (requestedUrl) => requestedUrl, respond = () => null }: TabsStubOptions) => {
    const updatedListeners = new Set<UpdatedListener>()
    const removedListeners = new Set<RemovedListener>()
    const navigations: string[] = []
    const removedTabIds: number[] = []
    let current: StubTab | null = null

    const emitUpdated = (changedTabId: number, changeInfo: Parameters<UpdatedListener>[1], tab: StubTab) => {
        for (const listener of Array.from(updatedListeners)) listener(changedTabId, changeInfo, tab)
    }

    const finishLoad = (url: string | undefined) => {
        current = { id: tabId, status: 'complete', url }
        emitUpdated(tabId, { status: 'complete' }, current)
    }

    const startLoad = (url: string | undefined) => {
        current = { id: tabId, status: 'loading', url: current?.url }
        setTimeout(() => {
            if (current !== null) finishLoad(url)
        }, 0)
    }

    return {
        navigations,
        removedTabIds,
        emitUpdated,
        finishLoad,
        listenerCount: () => updatedListeners.size + removedListeners.size,
        close: () => {
            current = null
            for (const listener of Array.from(removedListeners)) listener(tabId)
        },
        tabs: {
            create: async ({ url }: { url: string }) => {
                startLoad(readableUrlOf(url))
                return { id: tabId, status: 'loading' }
            },
            get: async () => {
                if (current === null) throw new Error('No tab with id')
                return current
            },
            update: async (_tabId: number, { url }: { url: string }) => {
                navigations.push(`update ${url}`)
                startLoad(readableUrlOf(url))
            },
            reload: async () => {
                navigations.push('reload')
                startLoad(current?.url)
            },
            remove: async (removedTabId: number) => {
                removedTabIds.push(removedTabId)
                current = null
            },
            sendMessage: async (_tabId: number, request: unknown) => respond(request, current),
            onUpdated: {
                addListener: (listener: UpdatedListener) => updatedListeners.add(listener),
                removeListener: (listener: UpdatedListener) => updatedListeners.delete(listener),
            },
            onRemoved: {
                addListener: (listener: RemovedListener) => removedListeners.add(listener),
                removeListener: (listener: RemovedListener) => removedListeners.delete(listener),
            },
        },
    }
}

/**
 * Builds a chrome.storage area stand-in backed by a map.
 * A write that touches one of the rejected keys fails as a whole, the way a
 * write over the storage quota does.
 * @param options - initial values and the keys whose writes are rejected
 */
export const createStorageArea = ({ initial = {}, rejectedKeys = [] }: StorageAreaOptions = {}) => {
    const values = new Map(Object.entries(initial))

    return {
        values,
        area: {
            get: async (key: string) => (values.has(key) ? { [key]: values.get(key) } : {}),
            set: async (items: Record<string, unknown>) => {
                if (Object.keys(items).some((key) => rejectedKeys.includes(key))) throw new Error('Resource::kQuotaBytes quota exceeded')
                for (const [key, value] of Object.entries(items)) values.set(key, value)
            },
            remove: async (keys: string | string[]) => {
                for (const key of [keys].flat()) values.delete(key)
            },
        },
    }
}
