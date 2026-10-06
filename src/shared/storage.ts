import { STORAGE_KEYS } from '@shared/constants'
import { CollectionStateSchema, DatasetSchema, LoginStateSchema, SettingsSchema, DEFAULT_SETTINGS } from '@shared/schema'
import type { CollectionState, Dataset, LoginState, Settings } from '@shared/schema'

const IDLE_COLLECTION: CollectionState = {
    status: 'idle',
    runId: null,
    phase: 'idle',
    message: '',
    percent: 0,
    startedAt: null,
    finishedAt: null,
    error: null,
    warnings: [],
    chartCount: 0,
    pagesFetched: 0,
}

const readValue = async (key: string) => {
    const stored = await chrome.storage.local.get(key)
    return stored[key] as unknown
}

export const readDataset = async (): Promise<Dataset | null> => {
    const value = await readValue(STORAGE_KEYS.dataset)
    if (value === undefined || value === null) return null

    const parsed = DatasetSchema.safeParse(value)
    return parsed.success ? parsed.data : null
}

export const writeDataset = async (dataset: Dataset) => {
    await chrome.storage.local.set({ [STORAGE_KEYS.dataset]: dataset })
}

export const readCollection = async (): Promise<CollectionState> => {
    const value = await readValue(STORAGE_KEYS.collection)
    if (value === undefined || value === null) return IDLE_COLLECTION

    const parsed = CollectionStateSchema.safeParse(value)
    return parsed.success ? parsed.data : IDLE_COLLECTION
}

export const writeCollection = async (state: CollectionState) => {
    await chrome.storage.local.set({ [STORAGE_KEYS.collection]: state })
}

export const readLogin = async (): Promise<LoginState | null> => {
    const value = await readValue(STORAGE_KEYS.login)
    if (value === undefined || value === null) return null

    const parsed = LoginStateSchema.safeParse(value)
    return parsed.success ? parsed.data : null
}

export const writeLogin = async (state: LoginState) => {
    await chrome.storage.local.set({ [STORAGE_KEYS.login]: state })
}

export const readSettings = async (): Promise<Settings> => {
    const value = await readValue(STORAGE_KEYS.settings)
    if (value === undefined || value === null) return DEFAULT_SETTINGS

    const parsed = SettingsSchema.safeParse(value)
    return parsed.success ? parsed.data : DEFAULT_SETTINGS
}

export const writeSettings = async (settings: Settings) => {
    await chrome.storage.local.set({ [STORAGE_KEYS.settings]: settings })
}

export const clearDataset = async () => {
    await chrome.storage.local.remove([STORAGE_KEYS.dataset, STORAGE_KEYS.collection])
}

export const readCollectionTabId = async () => {
    const stored = await chrome.storage.session.get('iidx:tabId')
    const value = stored['iidx:tabId']

    return typeof value === 'number' ? value : null
}

export const writeCollectionTabId = async (tabId: number | null) => {
    if (tabId === null) {
        await chrome.storage.session.remove('iidx:tabId')
        return
    }

    await chrome.storage.session.set({ 'iidx:tabId': tabId })
}
