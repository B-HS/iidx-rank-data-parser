import type { z } from 'zod'
import { LEGACY_STORAGE_KEYS, SESSION_STORAGE_KEYS, STORAGE_KEYS } from '@shared/constants'
import { RankHandoffSchema, RankSessionStateSchema, RankSyncStateSchema } from '@shared/rank-schema'
import type { RankHandoff, RankSessionState, RankSyncState } from '@shared/rank-schema'
import { CollectionStateSchema, DatasetSchema, LoginStateSchema, SettingsSchema, DEFAULT_SETTINGS } from '@shared/schema'
import type { CollectionState, Dataset, LoginState, Settings } from '@shared/schema'

export const IDLE_COLLECTION: CollectionState = {
    status: 'idle',
    runId: null,
    phase: 'idle',
    message: null,
    percent: 0,
    startedAt: null,
    updatedAt: null,
    finishedAt: null,
    error: null,
    warnings: [],
    chartCount: 0,
    pagesFetched: 0,
    datasetStatus: null,
}

const readValue = async (key: string) => {
    const stored = await chrome.storage.local.get(key)
    return stored[key] as unknown
}

const readParsed = async <S extends z.ZodTypeAny>(key: string, schema: S): Promise<z.infer<S> | null> => {
    const value = await readValue(key)
    if (value === undefined || value === null) return null

    const parsed = schema.safeParse(value)
    return parsed.success ? parsed.data : null
}

export const readDataset = (): Promise<Dataset | null> => readParsed(STORAGE_KEYS.dataset, DatasetSchema)

export const writeDataset = async (dataset: Dataset) => {
    await chrome.storage.local.set({ [STORAGE_KEYS.dataset]: dataset })
}

export const readCollection = async (): Promise<CollectionState> =>
    (await readParsed(STORAGE_KEYS.collection, CollectionStateSchema)) ?? IDLE_COLLECTION

export const writeCollection = async (state: CollectionState) => {
    await chrome.storage.local.set({ [STORAGE_KEYS.collection]: state })
}

export const readLogin = (): Promise<LoginState | null> => readParsed(STORAGE_KEYS.login, LoginStateSchema)

export const writeLogin = async (state: LoginState) => {
    await chrome.storage.local.set({ [STORAGE_KEYS.login]: state })
}

export const readSettings = async (): Promise<Settings> => (await readParsed(STORAGE_KEYS.settings, SettingsSchema)) ?? DEFAULT_SETTINGS

export const writeSettings = async (settings: Settings) => {
    await chrome.storage.local.set({ [STORAGE_KEYS.settings]: settings })
}

export const readRankSession = (): Promise<RankSessionState | null> => readParsed(STORAGE_KEYS.rankSession, RankSessionStateSchema)

export const writeRankSession = async (state: RankSessionState) => {
    await chrome.storage.local.set({ [STORAGE_KEYS.rankSession]: state })
}

export const readRankSync = (): Promise<RankSyncState | null> => readParsed(STORAGE_KEYS.rankSync, RankSyncStateSchema)

export const writeRankSync = async (state: RankSyncState) => {
    await chrome.storage.local.set({ [STORAGE_KEYS.rankSync]: state })
}

export const readRankHandoff = async (): Promise<RankHandoff | null> => {
    const stored = await chrome.storage.session.get(SESSION_STORAGE_KEYS.rankHandoff)
    const parsed = RankHandoffSchema.safeParse(stored[SESSION_STORAGE_KEYS.rankHandoff])

    return parsed.success ? parsed.data : null
}

export const writeRankHandoff = async (handoff: RankHandoff) => {
    await chrome.storage.session.set({ [SESSION_STORAGE_KEYS.rankHandoff]: handoff })
}

export const clearRankHandoff = async () => {
    await chrome.storage.session.remove(SESSION_STORAGE_KEYS.rankHandoff)
}

export const clearDataset = async () => {
    await chrome.storage.local.remove([STORAGE_KEYS.dataset, STORAGE_KEYS.collection, STORAGE_KEYS.rankSync])
    await clearRankHandoff()
}

export const removeLegacyValues = async () => {
    await chrome.storage.local.remove(LEGACY_STORAGE_KEYS)
}

export const readCollectionTabId = async () => {
    const stored = await chrome.storage.session.get(SESSION_STORAGE_KEYS.collectionTabId)
    const value: unknown = stored[SESSION_STORAGE_KEYS.collectionTabId]

    return typeof value === 'number' ? value : null
}

export const writeCollectionTabId = async (tabId: number | null) => {
    if (tabId === null) {
        await chrome.storage.session.remove(SESSION_STORAGE_KEYS.collectionTabId)
        return
    }

    await chrome.storage.session.set({ [SESSION_STORAGE_KEYS.collectionTabId]: tabId })
}
