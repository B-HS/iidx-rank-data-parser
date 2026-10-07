import { z } from 'zod'
import { RankHandoffPayloadSchema, RankHandoffResultSchema } from '@shared/rank-schema'

export const RANK_BRIDGE_CHANNEL = 'iidx-rank-import'

const channel = z.literal(RANK_BRIDGE_CHANNEL)

export const RankBridgePageMessageSchema = z.discriminatedUnion('type', [
    z.object({ channel, type: z.literal('ready') }),
    RankHandoffResultSchema.extend({ channel, type: z.literal('result') }),
])

export const RankBridgeExtensionMessageSchema = z.discriminatedUnion('type', [
    z.object({ channel, type: z.literal('hello') }),
    RankHandoffPayloadSchema.extend({ channel, type: z.literal('payload') }),
    z.object({ channel, type: z.literal('none') }),
])

export type RankBridgeExtensionMessage = z.infer<typeof RankBridgeExtensionMessageSchema>
