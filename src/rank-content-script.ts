import { startRankBridge } from '@core/rank-bridge'
import { RankHandoffResponseSchema } from '@shared/messages'
import type { BackgroundRequest } from '@shared/messages'

const send = (request: BackgroundRequest): Promise<unknown> => chrome.runtime.sendMessage(request)

startRankBridge({
    view: window,
    requestHandoff: async () => {
        const response = RankHandoffResponseSchema.safeParse(await send({ type: 'GET_RANK_HANDOFF' }))

        return response.success ? response.data.data.handoff : null
    },
    reportResult: async (result) => {
        await send({ type: 'REPORT_RANK_RESULT', ...result })
    },
})
