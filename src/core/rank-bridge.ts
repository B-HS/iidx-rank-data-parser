import { RANK_BRIDGE_CHANNEL, RankBridgePageMessageSchema } from '@shared/rank-bridge-schema'
import type { RankBridgeExtensionMessage } from '@shared/rank-bridge-schema'
import type { RankHandoffPayload, RankHandoffResult } from '@shared/rank-schema'

type RankBridgeDeps = {
    view: Window
    requestHandoff: () => Promise<RankHandoffPayload | null>
    reportResult: (result: RankHandoffResult) => Promise<void>
}

/**
 * Connects the iidx-rank import page to the extension over window.postMessage.
 * Announces itself with `hello`, answers every `ready` with the pending
 * handoff body or `none`, and forwards a validated `result` to the background.
 * Messages from another window, another origin, another channel, or with an
 * unexpected shape are ignored without a reply.
 * @param deps - page window and the background requests used by the bridge
 * @returns function that stops listening
 */
export const startRankBridge = ({ view, requestHandoff, reportResult }: RankBridgeDeps) => {
    const origin = view.location.origin
    const post = (message: RankBridgeExtensionMessage) => view.postMessage(message, origin)

    const answerReady = async () => {
        const handoff = await requestHandoff().catch(() => null)

        post(handoff === null ? { channel: RANK_BRIDGE_CHANNEL, type: 'none' } : { channel: RANK_BRIDGE_CHANNEL, type: 'payload', ...handoff })
    }

    const handleMessage = (event: MessageEvent<unknown>) => {
        if (event.source !== view || event.origin !== origin) return

        const message = RankBridgePageMessageSchema.safeParse(event.data)
        if (!message.success) return

        if (message.data.type === 'ready') {
            void answerReady()
            return
        }

        void reportResult({ handoffId: message.data.handoffId, outcome: message.data.outcome }).catch(() => undefined)
    }

    view.addEventListener('message', handleMessage)
    post({ channel: RANK_BRIDGE_CHANNEL, type: 'hello' })

    return () => view.removeEventListener('message', handleMessage)
}
