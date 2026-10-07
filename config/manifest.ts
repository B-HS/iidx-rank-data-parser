import baseManifest from '../public/manifest.json'
import { toHostMatchPattern } from '../src/shared/rank-origin'

export const RANK_CONTENT_SCRIPT = 'rank-content-script.js'

/**
 * Builds the shipped manifest for a target iidx-rank origin.
 * The origin is added to host_permissions so the extension can read the
 * iidx-rank session, and a content script is registered on every path of that
 * origin so the import page can receive the collected data.
 * @param rankOrigin - origin produced by normalizeRankOrigin
 */
export const buildManifest = (rankOrigin: string) => ({
    ...baseManifest,
    host_permissions: Array.from(new Set([...baseManifest.host_permissions, toHostMatchPattern(rankOrigin)])),
    content_scripts: [
        ...baseManifest.content_scripts,
        { matches: [toHostMatchPattern(rankOrigin)], js: [RANK_CONTENT_SCRIPT], run_at: 'document_idle' },
    ],
})
