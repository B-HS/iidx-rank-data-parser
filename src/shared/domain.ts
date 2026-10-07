export const PLAY_STYLES = [0, 1] as const
export const DIFFICULTY_NAMES = ['BEGINNER', 'NORMAL', 'HYPER', 'ANOTHER', 'LEGGENDARIA'] as const
export const DIFFICULTY_SHORT_CODES = ['B', 'N', 'H', 'A', 'L'] as const
export const LAMP_VALUES = ['NO_PLAY', 'FAILED', 'ASSIST', 'EASY', 'CLEAR', 'HARD', 'EX_HARD', 'FULL_COMBO'] as const
export const DJ_LEVELS = ['F', 'E', 'D', 'C', 'B', 'A', 'AA', 'AAA'] as const
export const RADAR_AXES = ['NOTES', 'CHORD', 'PEAK', 'CHARGE', 'SCRATCH', 'SOF-LAN'] as const
export const COLLECTION_STATUSES = ['idle', 'running', 'completed', 'failed', 'cancelled'] as const
export const COLLECTION_PHASES = ['idle', 'login', 'player', 'radar', 'charts', 'done', 'failed'] as const
export const DATASET_STATUSES = ['empty', 'partial', 'complete'] as const
export const DELAY_PROFILE_NAMES = ['fast', 'normal', 'slow'] as const

export const FLOW_FAILURES = [
    'tab_open_failed',
    'tab_closed',
    'load_timeout',
    'no_response',
    'extract_failed',
    'url_mismatch',
    'unexpected_page',
    'login_unreadable',
    'not_logged_in',
    'session_expired',
    'repeated_failures',
    'all_levels_failed',
    'aborted',
] as const
export const RETRYABLE_PAGE_FAILURES = ['load_timeout', 'no_response', 'extract_failed', 'url_mismatch', 'unexpected_page'] as const
export const LEVEL_FAILURES = ['no_response', 'extract_failed', 'url_mismatch', 'unexpected_page'] as const
export const RUN_ABORT_FAILURES = ['tab_closed', 'load_timeout', 'session_expired', 'repeated_failures'] as const
export const DIFFICULTY_PAGE_OUTCOMES = ['next', 'end', 'unexpected_page', 'login_required'] as const
export const EXTRACT_FAILURES = ['invalid_request', 'parse_error'] as const

export const DIFFICULTY_NAME_TO_CODE = {
    BEGINNER: 'B',
    NORMAL: 'N',
    HYPER: 'H',
    ANOTHER: 'A',
    LEGGENDARIA: 'L',
} as const satisfies Record<(typeof DIFFICULTY_NAMES)[number], (typeof DIFFICULTY_SHORT_CODES)[number]>

export const LAMP_NAME_BY_INDEX = {
    0: 'NO_PLAY',
    1: 'FAILED',
    2: 'ASSIST',
    3: 'EASY',
    4: 'CLEAR',
    5: 'HARD',
    6: 'EX_HARD',
    7: 'FULL_COMBO',
} as const satisfies Record<number, (typeof LAMP_VALUES)[number]>

export type DifficultyName = (typeof DIFFICULTY_NAMES)[number]
export type DifficultyCode = (typeof DIFFICULTY_SHORT_CODES)[number]
export type Lamp = (typeof LAMP_VALUES)[number]
export type DjLevel = (typeof DJ_LEVELS)[number]
export type RadarAxis = (typeof RADAR_AXES)[number]
export type CollectionStatus = (typeof COLLECTION_STATUSES)[number]
export type CollectionPhase = (typeof COLLECTION_PHASES)[number]
export type DatasetStatus = (typeof DATASET_STATUSES)[number]
export type DelayProfileName = (typeof DELAY_PROFILE_NAMES)[number]
export type PlayStyle = (typeof PLAY_STYLES)[number]
export type FlowFailure = (typeof FLOW_FAILURES)[number]
export type RetryablePageFailure = (typeof RETRYABLE_PAGE_FAILURES)[number]
export type LevelFailure = (typeof LEVEL_FAILURES)[number]
export type RunAbortFailure = (typeof RUN_ABORT_FAILURES)[number]
export type DifficultyPageOutcome = (typeof DIFFICULTY_PAGE_OUTCOMES)[number]
export type ExtractFailure = (typeof EXTRACT_FAILURES)[number]
