export const TILDE_VARIANTS = /[〜～∼]/g

export const normalizeTitleKey = (title: string) => title.normalize('NFKC').replace(TILDE_VARIANTS, '~').replace(/\s+/g, ' ').trim()

/**
 * Builds the same stable chart identifier used by iidx-rank.
 * @param title - chart title as shown on eagate
 * @param difficulty - single-letter chart difficulty code
 */
export const chartIdFrom = async (title: string, difficulty: string) => {
    const input = new TextEncoder().encode(`${normalizeTitleKey(title)}\u0000${difficulty}`)
    const digest = await crypto.subtle.digest('SHA-256', input)
    const hex = Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('')

    return `chart-${hex.slice(0, 32)}`
}
