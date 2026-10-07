import { z } from 'zod'
import { EXTRACT_FAILURES } from '@shared/domain'
import { LocalizedMessageSchema } from '@shared/message-keys'
import { RankHandoffPayloadSchema, RankHandoffResultSchema, RankOverviewSchema } from '@shared/rank-schema'
import {
    ChartSchema,
    CollectionStateSchema,
    DatasetStatusSchema,
    DifficultyPageSchema,
    LoginPageSchema,
    LoginStateSchema,
    NotesRadarSchema,
    PlayStyleSchema,
    PlayerSchema,
    SettingsSchema,
} from '@shared/schema'

const EXTRACT_TYPE = 'EXTRACT'

export const ExtractRequestSchema = z.discriminatedUnion('kind', [
    z.object({ type: z.literal(EXTRACT_TYPE), kind: z.literal('LOGIN') }),
    z.object({ type: z.literal(EXTRACT_TYPE), kind: z.literal('STATUS') }),
    z.object({ type: z.literal(EXTRACT_TYPE), kind: z.literal('RADAR') }),
    z.object({ type: z.literal(EXTRACT_TYPE), kind: z.literal('DIFFICULTY'), level: ChartSchema.shape.level, style: PlayStyleSchema }),
])

export type ExtractRequest = z.infer<typeof ExtractRequestSchema>
export type ExtractKind = ExtractRequest['kind']

export const ExtractEnvelopeSchema = z.object({ type: z.literal(EXTRACT_TYPE) })

export const ExtractResponseSchema = z.discriminatedUnion('kind', [
    z.object({ ok: z.literal(true), kind: z.literal('LOGIN'), url: z.string(), login: LoginPageSchema }),
    z.object({
        ok: z.literal(true),
        kind: z.literal('STATUS'),
        url: z.string(),
        requiresLogin: z.boolean(),
        player: PlayerSchema.nullable().catch(null),
        notesRadar: NotesRadarSchema.nullable().catch(null),
    }),
    z.object({ ok: z.literal(true), kind: z.literal('RADAR'), url: z.string(), notesRadar: NotesRadarSchema.nullable().catch(null) }),
    z.object({ ok: z.literal(true), kind: z.literal('DIFFICULTY'), url: z.string(), difficulty: DifficultyPageSchema }),
    z.object({ ok: z.literal(false), kind: z.literal('ERROR'), reason: z.enum(EXTRACT_FAILURES) }),
])

export type ExtractResponse = z.infer<typeof ExtractResponseSchema>
export type ExtractSuccess = Extract<ExtractResponse, { ok: true }>

export const BackgroundRequestSchema = z.discriminatedUnion('type', [
    z.object({ type: z.literal('GET_OVERVIEW') }),
    z.object({ type: z.literal('CHECK_LOGIN') }),
    z.object({ type: z.literal('START_COLLECTION'), settings: SettingsSchema }),
    z.object({ type: z.literal('CANCEL_COLLECTION') }),
    z.object({ type: z.literal('CLEAR_DATA') }),
    z.object({ type: z.literal('UPDATE_SETTINGS'), settings: SettingsSchema }),
    z.object({ type: z.literal('EXPORT_DATASET') }),
    z.object({ type: z.literal('EXPORT_RANK_IMPORT') }),
    z.object({ type: z.literal('CHECK_RANK_SESSION') }),
    z.object({ type: z.literal('SYNC_RANK') }),
    z.object({ type: z.literal('OPEN_RANK_LOGIN') }),
    z.object({ type: z.literal('GET_RANK_HANDOFF') }),
    RankHandoffResultSchema.extend({ type: z.literal('REPORT_RANK_RESULT') }),
])

export type BackgroundRequest = z.infer<typeof BackgroundRequestSchema>
export type BackgroundRequestType = BackgroundRequest['type']

export const BackgroundEnvelopeSchema = z.object({ type: z.string() })

export const OverviewSchema = z.object({
    login: LoginStateSchema.nullable(),
    collection: CollectionStateSchema,
    settings: SettingsSchema,
    dataset: z
        .object({
            status: DatasetStatusSchema,
            chartCount: z.number().int().nonnegative(),
            generatedAt: z.string().datetime().nullable(),
            style: PlayStyleSchema,
            djName: z.string().nullable(),
            notesRadar: NotesRadarSchema.nullable(),
        })
        .nullable(),
    rank: RankOverviewSchema,
})

export type Overview = z.infer<typeof OverviewSchema>

export const DownloadSchema = z.object({
    download: z.object({ filename: z.string(), content: z.string() }),
})

export type Download = z.infer<typeof DownloadSchema>

export const RankHandoffReplySchema = z.object({
    handoff: RankHandoffPayloadSchema.nullable(),
})

export const RankHandoffResponseSchema = z.object({ ok: z.literal(true), data: RankHandoffReplySchema })

export const BackgroundResponseSchema = z.union([
    z.object({ ok: z.literal(true), data: z.union([OverviewSchema, DownloadSchema, RankHandoffReplySchema, z.null()]) }),
    z.object({ ok: z.literal(false), error: LocalizedMessageSchema }),
])

export type BackgroundResponse = z.infer<typeof BackgroundResponseSchema>
