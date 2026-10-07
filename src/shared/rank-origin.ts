declare const __RANK_ORIGIN__: string | undefined

export const DEFAULT_RANK_ORIGIN = 'https://iidx.hyns.dev'
export const RANK_ORIGIN_DEFINE_KEY = '__RANK_ORIGIN__'

const ALLOWED_RANK_PROTOCOLS = ['https:', 'http:']

/**
 * Normalizes the build-time RANK_ORIGIN value to a bare origin.
 * @param raw - value of the RANK_ORIGIN environment variable, if any
 * @throws when the value is not an http(s) URL
 */
export const normalizeRankOrigin = (raw: string | undefined) => {
    const candidate = (raw ?? '').trim()
    if (candidate === '') return DEFAULT_RANK_ORIGIN

    const url = new URL(candidate)
    if (!ALLOWED_RANK_PROTOCOLS.includes(url.protocol)) throw new Error(`RANK_ORIGIN must be an http(s) origin: ${candidate}`)

    return url.origin
}

/**
 * Builds the host permission match pattern for an origin.
 * @param origin - origin produced by normalizeRankOrigin
 */
export const toHostMatchPattern = (origin: string) => `${origin}/*`

export const RANK_ORIGIN = typeof __RANK_ORIGIN__ === 'string' ? __RANK_ORIGIN__ : DEFAULT_RANK_ORIGIN
