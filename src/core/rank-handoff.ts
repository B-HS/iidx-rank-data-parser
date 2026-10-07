import { RANK_HANDOFF_TTL_MS } from '@shared/rank-schema'
import type { RankHandoff } from '@shared/rank-schema'

type RankSender = Pick<chrome.runtime.MessageSender, 'id' | 'url' | 'origin' | 'frameId'> & { tab?: Pick<chrome.tabs.Tab, 'id'> }

type RankSenderExpectation = {
    extensionId: string
    origin: string
}

const TOP_FRAME_ID = 0

const originOf = (url: string | undefined) => {
    try {
        return url === undefined ? null : new URL(url).origin
    } catch {
        return null
    }
}

/**
 * Tells whether a handoff can still be handed to the import page.
 * @param handoff - stored handoff, if any
 * @param nowMs - current time in epoch milliseconds
 */
export const isRankHandoffAlive = (handoff: RankHandoff | null, nowMs: number): handoff is RankHandoff =>
    handoff !== null && nowMs - Date.parse(handoff.createdAt) < RANK_HANDOFF_TTL_MS

/**
 * Tells whether a runtime message came from this extension's content script
 * running in the top frame of an iidx-rank tab.
 * @param sender - sender reported by chrome.runtime.onMessage
 * @param expected - this extension's id and the iidx-rank origin
 */
export const isRankTabSender = (sender: RankSender, expected: RankSenderExpectation) =>
    sender.id === expected.extensionId &&
    sender.tab?.id !== undefined &&
    sender.frameId === TOP_FRAME_ID &&
    originOf(sender.url) === expected.origin &&
    (sender.origin ?? expected.origin) === expected.origin
