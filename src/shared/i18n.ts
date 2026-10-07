import { MANIFEST_MESSAGE_KEYS, MESSAGE_PARAMS } from '@shared/message-keys'

export const POPUP_MESSAGE_PARAMS = {
    popup_subtitle: [],
    popup_loading: [],
    popup_error_background_unreachable: [],
    popup_error_invalid_response: [],
    popup_status_unchecked: [],
    popup_status_logged_in: [],
    popup_status_logged_out: [],
    popup_status_check_failed: [],
    popup_eamusement_title: [],
    popup_eamusement_hint_unchecked: [],
    popup_eamusement_hint_logged_out: [],
    popup_eamusement_hint_failed: [],
    popup_label_community: [],
    popup_label_checked_at: [],
    popup_action_check_login: [],
    popup_rank_title: [],
    popup_rank_target: ['origin'],
    popup_rank_hint_unchecked: [],
    popup_rank_hint_logged_out: [],
    popup_rank_hint_logged_in: [],
    popup_rank_hint_network: [],
    popup_rank_hint_server_error: [],
    popup_label_name: [],
    popup_label_handle: [],
    popup_action_open_rank_login: [],
    popup_action_recheck: [],
    popup_settings_title: [],
    popup_settings_style: [],
    popup_settings_levels: [],
    popup_settings_delay: [],
    popup_settings_note_scope: [],
    popup_settings_warning_dp: [],
    popup_action_start: [],
    popup_action_collecting: [],
    popup_reason_collecting: [],
    popup_reason_syncing: [],
    popup_reason_login_unchecked: [],
    popup_reason_login_failed: [],
    popup_reason_login_required: [],
    popup_reason_no_levels: [],
    popup_reason_no_dataset: [],
    popup_progress_title: [],
    popup_progress_label: [],
    popup_progress_idle: [],
    popup_collection_status_idle: [],
    popup_collection_status_running: [],
    popup_collection_status_completed: [],
    popup_collection_status_failed: [],
    popup_collection_status_cancelled: [],
    popup_dataset_status_empty: [],
    popup_dataset_status_partial: [],
    popup_dataset_status_complete: [],
    popup_label_charts: [],
    popup_label_pages: [],
    popup_label_started: [],
    popup_warnings_heading: ['count'],
    popup_warnings_more: ['count'],
    popup_action_cancel: [],
    popup_dataset_title: [],
    popup_dataset_empty: [],
    popup_label_chart_count: [],
    popup_label_generated: [],
    popup_label_style: [],
    popup_action_export_dataset: [],
    popup_action_export_rank: [],
    popup_action_clear: [],
    popup_clear_confirm_message: [],
    popup_action_clear_confirm: [],
    popup_action_back: [],
    popup_sync_title: [],
    popup_sync_description: [],
    popup_action_sync: [],
    popup_action_syncing: [],
    popup_sync_none: [],
    popup_sync_status_success: [],
    popup_sync_status_failed: [],
    popup_sync_status_skipped: [],
    popup_sync_status_pending: [],
    popup_sync_pending_hint: [],
    popup_sync_trigger_auto: [],
    popup_sync_trigger_manual: [],
    popup_label_sync_time: [],
    popup_label_sync_trigger: [],
    popup_label_sync_account: [],
    popup_label_received: [],
    popup_label_matched: [],
    popup_label_changed: [],
    popup_label_unmatched: [],
    popup_label_reason: [],
    popup_sync_unmatched_hint: [],
    popup_sync_unmatched_more: ['count'],
    popup_sync_server_code: ['code'],
    popup_footer_note: [],
} as const satisfies Record<string, readonly string[]>

const MANIFEST_PARAMS = { extName: [], extDescription: [] } as const satisfies Record<(typeof MANIFEST_MESSAGE_KEYS)[number], readonly string[]>

export const TRANSLATION_PARAMS = { ...MESSAGE_PARAMS, ...POPUP_MESSAGE_PARAMS, ...MANIFEST_PARAMS } as const

export type PopupMessageKey = keyof typeof POPUP_MESSAGE_PARAMS
export type TranslationKey = keyof typeof TRANSLATION_PARAMS

export const POPUP_MESSAGE_KEYS: string[] = Object.keys(POPUP_MESSAGE_PARAMS)

export type TranslatableMessage = { key: TranslationKey; params: readonly string[] }

type TranslationParamName<K extends TranslationKey> = (typeof TRANSLATION_PARAMS)[K][number]

type TranslationArgs<K extends TranslationKey> = [TranslationParamName<K>] extends [never]
    ? []
    : [params: Record<TranslationParamName<K>, string | number>]

/**
 * Renders a stored message reference with chrome.i18n in the browser UI language.
 * Falls back to the key itself so a missing message never renders as an empty string.
 * @param message - key and positional params, as stored by the background worker
 */
export const translateMessage = ({ key, params }: TranslatableMessage) => {
    const text = chrome.i18n.getMessage(key, [...params])

    return text === '' ? key : text
}

/**
 * Translates a key, taking named params in the order declared for that key.
 * @param key - message key defined in the locale files
 * @param args - named params required by the key, omitted when the key takes none
 */
export const t = <K extends TranslationKey>(key: K, ...args: TranslationArgs<K>) => {
    const names: readonly string[] = TRANSLATION_PARAMS[key]
    const provided: ReadonlyArray<Record<string, string | number>> = args
    const values = new Map(Object.entries(provided[0] ?? {}))

    return translateMessage({ key, params: names.map((name) => String(values.get(name) ?? '')) })
}

const DATE_TIME_OPTIONS = { dateStyle: 'medium', timeStyle: 'short' } as const satisfies Intl.DateTimeFormatOptions
const EMPTY_VALUE = '-'

/**
 * Formats an ISO timestamp for the browser UI language.
 * @param iso - ISO 8601 timestamp, or null when there is no value
 */
export const formatDateTime = (iso: string | null) => {
    if (iso === null) return EMPTY_VALUE

    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return EMPTY_VALUE

    return new Intl.DateTimeFormat(chrome.i18n.getUILanguage(), DATE_TIME_OPTIONS).format(date)
}

/**
 * Formats a number for the browser UI language.
 * @param value - number to format, or null when there is no value
 * @param fractionDigits - fixed number of fraction digits
 */
export const formatNumber = (value: number | null, fractionDigits = 0) => {
    if (value === null) return EMPTY_VALUE

    return new Intl.NumberFormat(chrome.i18n.getUILanguage(), {
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
    }).format(value)
}
