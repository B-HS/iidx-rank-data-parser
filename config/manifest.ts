import baseManifest from '../public/manifest.json'
import { toHostMatchPattern } from '../src/shared/rank-origin'

/**
 * Builds the shipped manifest for a target iidx-rank origin.
 * The origin is added to host_permissions so the extension can call the
 * iidx-rank API with the browser session.
 * @param rankOrigin - origin produced by normalizeRankOrigin
 */
export const buildManifest = (rankOrigin: string) => ({
    ...baseManifest,
    host_permissions: Array.from(new Set([...baseManifest.host_permissions, toHostMatchPattern(rankOrigin)])),
})
