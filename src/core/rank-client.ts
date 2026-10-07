import { RANK_API_PATHS, RANK_SESSION_TIMEOUT_MS, RankSessionResponseSchema } from '@shared/rank-schema'
import type { RankSessionError, RankUser } from '@shared/rank-schema'

type RankFetch = (input: string, init: RequestInit) => Promise<Response>

type RankClientDeps = {
    origin: string
    fetch: RankFetch
}

type RankSessionResult = { ok: true; user: RankUser | null } | { ok: false; error: RankSessionError }

const HTTP_OK = 200

/**
 * Creates the iidx-rank API client used by the extension.
 * It only asks who is signed in. Records are uploaded by the iidx-rank import
 * page, not by the extension. The request relies on the browser attaching the
 * site session cookie through `credentials: 'include'`, and the client never
 * reads or stores cookies or tokens.
 * @param deps - target origin and the fetch implementation
 */
export const createRankClient = (deps: RankClientDeps) => ({
    getSession: async (): Promise<RankSessionResult> => {
        try {
            const response = await deps.fetch(`${deps.origin}${RANK_API_PATHS.session}`, {
                method: 'GET',
                credentials: 'include',
                cache: 'no-store',
                signal: AbortSignal.timeout(RANK_SESSION_TIMEOUT_MS),
            })
            const body: unknown = await response.json().catch(() => null)

            const parsed = RankSessionResponseSchema.safeParse(body)
            if (response.status !== HTTP_OK || !parsed.success) return { ok: false, error: 'server_error' }

            return { ok: true, user: parsed.data.data.user }
        } catch {
            return { ok: false, error: 'network' }
        }
    },
})

export type RankClient = ReturnType<typeof createRankClient>
