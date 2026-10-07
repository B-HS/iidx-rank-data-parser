import { OverviewSchema } from '@shared/messages'
import type { Overview } from '@shared/messages'
import { IDLE_COLLECTION } from '@shared/storage'
import { DEFAULT_SETTINGS } from '@shared/schema'

const CHECKED_AT = '2026-10-07T10:00:00.000Z'
const RANK_ORIGIN_FOR_TEST = 'https://iidx.hyns.dev'

export const LOGGED_IN_EAMUSEMENT = {
    isLoggedIn: true,
    checkedAt: CHECKED_AT,
    pageUrl: 'https://p.eagate.573.jp/game/2dx/34/index.html',
    communityNickname: 'COMMUNITY',
    djName: '-TEST-',
    error: null,
} as const

export const LOGGED_IN_RANK_SESSION = {
    user: { id: 'u1', name: 'Rank User', handle: 'rank-user' },
    checkedAt: CHECKED_AT,
    error: null,
} as const

export const SAVED_DATASET = {
    status: 'complete',
    chartCount: 612,
    generatedAt: '2026-10-07T10:05:00.000Z',
    style: 0,
    djName: '-TEST-',
    notesRadar: {
        values: { NOTES: 128.45, CHORD: 131.22, PEAK: 118.9, CHARGE: 142, SCRATCH: 136.75, 'SOF-LAN': 124.1 },
        raw: [],
        source: 'status',
        matchedByLabel: true,
    },
} as const

type OverviewInput = {
    login?: unknown
    collection?: Partial<Overview['collection']>
    settings?: Partial<Overview['settings']>
    dataset?: unknown
    rank?: Partial<Overview['rank']>
}

/**
 * Builds an overview through the real schema so fixtures cannot drift from the contract.
 * @param input - fields to override on top of an empty, signed-out overview
 */
export const buildOverview = (input: OverviewInput = {}): Overview =>
    OverviewSchema.parse({
        login: input.login ?? null,
        collection: { ...IDLE_COLLECTION, ...input.collection },
        settings: { ...DEFAULT_SETTINGS, ...input.settings },
        dataset: input.dataset ?? null,
        rank: { origin: RANK_ORIGIN_FOR_TEST, session: null, lastSync: null, isSyncing: false, ...input.rank },
    })
