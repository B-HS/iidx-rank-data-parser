import type { CollectionState, Dataset, LoginState, Settings } from '@shared/schema'

export const EXTRACT_KINDS = ['LOGIN', 'STATUS', 'RADAR', 'DIFFICULTY'] as const

export type ExtractKind = (typeof EXTRACT_KINDS)[number]

export type ExtractRequest = {
    type: 'EXTRACT'
    kind: ExtractKind
    level?: number
    style?: 0 | 1
}

export type ExtractPayload = {
    url: string
    login: { isLoggedIn: boolean; communityNickname: string | null; djName: string | null } | null
    status: unknown
    radar: unknown
    difficulty: { charts: unknown[]; isNoData: boolean; requiresLogin: boolean } | null
}

export type ExtractResponse = { ok: true; payload: ExtractPayload } | { ok: false; error: string }

export const BACKGROUND_REQUESTS = [
    'GET_OVERVIEW',
    'CHECK_LOGIN',
    'START_COLLECTION',
    'CANCEL_COLLECTION',
    'CLEAR_DATA',
    'UPDATE_SETTINGS',
    'EXPORT_DATASET',
    'EXPORT_RANK_IMPORT',
] as const

export type BackgroundRequestType = (typeof BACKGROUND_REQUESTS)[number]

export type Overview = {
    login: LoginState | null
    collection: CollectionState
    settings: Settings
    dataset: {
        status: Dataset['meta']['status']
        chartCount: number
        generatedAt: string | null
        djName: string | null
        notesRadar: Dataset['notesRadar']
    } | null
}

export type BackgroundRequest =
    | { type: 'GET_OVERVIEW' }
    | { type: 'CHECK_LOGIN' }
    | { type: 'START_COLLECTION'; settings: Settings }
    | { type: 'CANCEL_COLLECTION' }
    | { type: 'CLEAR_DATA' }
    | { type: 'UPDATE_SETTINGS'; settings: Settings }
    | { type: 'EXPORT_DATASET' }
    | { type: 'EXPORT_RANK_IMPORT' }

export type BackgroundResponse =
    | { ok: true; data: Overview }
    | { ok: true; data: { download: { filename: string; content: string } } }
    | { ok: true; data: null }
    | { ok: false; error: string }
