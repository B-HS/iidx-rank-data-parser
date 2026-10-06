export const GAME_VERSION = 34

export const EAGATE_ORIGIN = 'https://p.eagate.573.jp'
export const GAME_BASE_PATH = `/game/2dx/${GAME_VERSION}`

export const EAGATE_URLS = {
    index: `${EAGATE_ORIGIN}${GAME_BASE_PATH}/index.html`,
    status: `${EAGATE_ORIGIN}${GAME_BASE_PATH}/djdata/status.html`,
    notesRadar: `${EAGATE_ORIGIN}${GAME_BASE_PATH}/djdata/music/notesradar.html`,
    difficulty: `${EAGATE_ORIGIN}${GAME_BASE_PATH}/djdata/music/difficulty.html`,
    login: `${EAGATE_ORIGIN}/gate/p/login.html`,
} as const

export const DIFFICULTY_OFFSET_STEP = 50
export const DIFFICULTY_MAX_PAGES_PER_LEVEL = 60
export const DIFFICULTY_PAGE_ESTIMATE = 16

export const LEVEL_MIN = 1
export const LEVEL_MAX = 12
export const DEFAULT_LEVELS = [12]
export const DEFAULT_PLAY_STYLE = 0
export const DIFFICULTY_DISP = '1'

export const DELAY_PROFILES = {
    fast: { minMs: 300, maxMs: 650, label: '빠름' },
    normal: { minMs: 500, maxMs: 1100, label: '보통' },
    slow: { minMs: 900, maxMs: 1600, label: '느긋' },
} as const

export const LOGIN_STATE_MAX_AGE_MS = 60_000
export const COLLECTION_STALE_MS = 5 * 60_000
export const CREATED_TAB_CLOSE_DELAY_MS = 1500
export const NOT_LOGGED_IN_MARKER = '---'
export const NO_DATA_MARKER = 'データがみつかりません'

export const STORAGE_KEYS = {
    dataset: 'iidx:dataset:v1',
    collection: 'iidx:collection:v1',
    login: 'iidx:login:v1',
    settings: 'iidx:settings:v1',
} as const

export const DATASET_FORMAT = 'iidx-data-parser'
export const DATASET_SCHEMA_VERSION = 1
export const EXPORT_FILE_PREFIX = 'iidx-data-parser'
