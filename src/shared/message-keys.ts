import { z } from 'zod'

export const MESSAGE_KEY_PATTERN = /^[A-Za-z0-9_]+$/
export const MESSAGE_PARAM_LIMIT = 9

export const MANIFEST_MESSAGE_KEYS = ['extName', 'extDescription'] as const

export const MESSAGE_KEYS = [
    'progress_starting',
    'progress_login',
    'progress_player',
    'progress_radar',
    'progress_charts',
    'progress_saved',
    'progress_saved_partial',
    'progress_saved_empty',
    'progress_cancelled',
    'progress_failed',
    'error_unknown',
    'error_invalid_request',
    'error_busy',
    'error_no_dataset',
    'error_interrupted',
    'error_tab_open_failed',
    'error_tab_closed',
    'error_load_timeout',
    'error_no_response',
    'error_extract_failed',
    'error_url_mismatch',
    'error_unexpected_page',
    'error_login_unreadable',
    'error_not_logged_in',
    'error_session_expired',
    'error_repeated_failures',
    'error_all_levels_failed',
    'error_aborted',
    'warning_page_no_response',
    'warning_page_extract_failed',
    'warning_page_url_mismatch',
    'warning_page_unexpected_page',
    'warning_page_rows_skipped',
    'warning_level_first_page_empty',
    'warning_level_page_limit',
    'warning_aborted_tab_closed',
    'warning_aborted_load_timeout',
    'warning_aborted_session_expired',
    'warning_aborted_repeated_failures',
    'warning_charts_dropped',
    'warning_player_missing',
    'warning_radar_missing',
    'delay_profile_fast',
    'delay_profile_normal',
    'delay_profile_slow',
    'rank_reason_not_logged_in',
    'rank_reason_dp_unsupported',
    'rank_reason_no_data',
    'rank_reason_rate_limited',
    'rank_reason_network',
    'rank_reason_server_error',
    'rank_reason_invalid_payload',
    'rank_reason_handoff_expired',
] as const

export type MessageKey = (typeof MESSAGE_KEYS)[number]

export const MESSAGE_PARAMS = {
    progress_starting: [],
    progress_login: [],
    progress_player: [],
    progress_radar: [],
    progress_charts: ['level', 'page', 'offset'],
    progress_saved: ['count'],
    progress_saved_partial: ['count'],
    progress_saved_empty: [],
    progress_cancelled: [],
    progress_failed: [],
    error_unknown: [],
    error_invalid_request: [],
    error_busy: [],
    error_no_dataset: [],
    error_interrupted: [],
    error_tab_open_failed: [],
    error_tab_closed: [],
    error_load_timeout: [],
    error_no_response: [],
    error_extract_failed: [],
    error_url_mismatch: [],
    error_unexpected_page: [],
    error_login_unreadable: [],
    error_not_logged_in: [],
    error_session_expired: [],
    error_repeated_failures: [],
    error_all_levels_failed: [],
    error_aborted: [],
    warning_page_no_response: ['level', 'offset'],
    warning_page_extract_failed: ['level', 'offset'],
    warning_page_url_mismatch: ['level', 'offset'],
    warning_page_unexpected_page: ['level', 'offset'],
    warning_page_rows_skipped: ['level', 'offset', 'count'],
    warning_level_first_page_empty: ['level'],
    warning_level_page_limit: ['level', 'limit'],
    warning_aborted_tab_closed: ['levels'],
    warning_aborted_load_timeout: ['levels'],
    warning_aborted_session_expired: ['levels'],
    warning_aborted_repeated_failures: ['levels'],
    warning_charts_dropped: ['count'],
    warning_player_missing: [],
    warning_radar_missing: [],
    delay_profile_fast: [],
    delay_profile_normal: [],
    delay_profile_slow: [],
    rank_reason_not_logged_in: [],
    rank_reason_dp_unsupported: [],
    rank_reason_no_data: [],
    rank_reason_rate_limited: [],
    rank_reason_network: [],
    rank_reason_server_error: [],
    rank_reason_invalid_payload: [],
    rank_reason_handoff_expired: [],
} as const satisfies Record<MessageKey, readonly string[]>

export const LocalizedMessageSchema = z.object({
    key: z.enum(MESSAGE_KEYS),
    params: z.array(z.string()).max(MESSAGE_PARAM_LIMIT),
})

export type LocalizedMessage = z.infer<typeof LocalizedMessageSchema>

type MessageParamName<K extends MessageKey> = (typeof MESSAGE_PARAMS)[K][number]

type MessageArgs<K extends MessageKey> = [MessageParamName<K>] extends [never] ? [] : [params: Record<MessageParamName<K>, string | number>]

/**
 * Builds a storable message reference instead of a rendered sentence.
 * Params are emitted in the order declared in MESSAGE_PARAMS so they map to
 * the positional $1..$9 substitutions of chrome.i18n.getMessage.
 * @param key - message key defined in MESSAGE_KEYS
 * @param args - named params required by the key, omitted when the key takes none
 */
export const toMessage = <K extends MessageKey>(key: K, ...args: MessageArgs<K>): LocalizedMessage => {
    const names: readonly string[] = MESSAGE_PARAMS[key]
    const provided: ReadonlyArray<Record<string, string | number>> = args
    const values = new Map(Object.entries(provided[0] ?? {}))

    return { key, params: names.map((name) => String(values.get(name) ?? '')) }
}
