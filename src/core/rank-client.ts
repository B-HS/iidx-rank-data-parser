import {
    RANK_API_PATHS,
    RANK_IMPORT_MAX_BYTES,
    RANK_IMPORT_TIMEOUT_MS,
    RANK_SESSION_TIMEOUT_MS,
    RankErrorResponseSchema,
    RankImportResponseSchema,
    RankSessionResponseSchema,
} from '@shared/rank-schema'
import type { RankImport, RankImportResult, RankSessionError, RankSyncReason, RankUser } from '@shared/rank-schema'

type RankFetch = (input: string, init: RequestInit) => Promise<Response>

type RankClientDeps = {
    origin: string
    fetch: RankFetch
}

type RankSessionResult = { ok: true; user: RankUser | null } | { ok: false; error: RankSessionError }

type RankImportOutcome = { ok: true; data: RankImportResult } | { ok: false; reason: RankSyncReason; serverCode: string | null }

const HTTP_OK = 200
const HTTP_SUCCESS_END = 300

const REASON_BY_SERVER_CODE = new Map<string, RankSyncReason>([
    ['AUTH_REQUIRED', 'not_logged_in'],
    ['ORIGIN_NOT_ALLOWED', 'origin_rejected'],
    ['IMPORT_COOLDOWN', 'rate_limited'],
    ['UNSUPPORTED_STYLE', 'dp_unsupported'],
    ['INVALID_INPUT', 'invalid_payload'],
])

const REASON_BY_STATUS = new Map<number, RankSyncReason>([
    [400, 'invalid_payload'],
    [401, 'not_logged_in'],
    [403, 'origin_rejected'],
    [413, 'invalid_payload'],
    [429, 'rate_limited'],
])

/**
 * Creates the iidx-rank API client used by the extension.
 * Requests rely on the browser attaching the site session cookie through
 * `credentials: 'include'`. The client never reads or stores cookies or tokens.
 * @param deps - target origin and the fetch implementation
 */
export const createRankClient = (deps: RankClientDeps) => {
    const request = async (path: string, init: RequestInit, timeoutMs: number) => {
        try {
            const response = await deps.fetch(`${deps.origin}${path}`, {
                ...init,
                credentials: 'include',
                cache: 'no-store',
                signal: AbortSignal.timeout(timeoutMs),
            })
            const body: unknown = await response.json().catch(() => null)

            return { status: response.status, body }
        } catch {
            return null
        }
    }

    return {
        getSession: async (): Promise<RankSessionResult> => {
            const response = await request(RANK_API_PATHS.session, { method: 'GET' }, RANK_SESSION_TIMEOUT_MS)
            if (response === null) return { ok: false, error: 'network' }

            const parsed = RankSessionResponseSchema.safeParse(response.body)
            if (response.status !== HTTP_OK || !parsed.success) return { ok: false, error: 'server_error' }

            return { ok: true, user: parsed.data.data.user }
        },

        importRecords: async (payload: RankImport): Promise<RankImportOutcome> => {
            const body = JSON.stringify(payload)
            if (new TextEncoder().encode(body).length > RANK_IMPORT_MAX_BYTES) return { ok: false, reason: 'invalid_payload', serverCode: null }

            const response = await request(
                RANK_API_PATHS.importRecords,
                { method: 'POST', headers: { 'Content-Type': 'application/json' }, body },
                RANK_IMPORT_TIMEOUT_MS,
            )
            if (response === null) return { ok: false, reason: 'network', serverCode: null }

            const isSuccessStatus = response.status >= HTTP_OK && response.status < HTTP_SUCCESS_END
            const success = RankImportResponseSchema.safeParse(response.body)
            if (isSuccessStatus && success.success) return { ok: true, data: success.data.data }

            const failure = RankErrorResponseSchema.safeParse(response.body)
            const serverCode = failure.success ? failure.data.error.code : null
            const reason =
                (serverCode === null ? undefined : REASON_BY_SERVER_CODE.get(serverCode)) ?? REASON_BY_STATUS.get(response.status) ?? 'server_error'

            return { ok: false, reason, serverCode }
        },
    }
}

export type RankClient = ReturnType<typeof createRankClient>
