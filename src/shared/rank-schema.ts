import { z } from 'zod'
import { LEVEL_MAX, LEVEL_MIN } from '@shared/constants'
import { DifficultyCodeSchema, DjLevelSchema, LampSchema, PlayStyleSchema } from '@shared/schema'

export const RANK_IMPORT_VERSION = 2
export const RANK_IMPORT_KIND = 'iidx-rank-import'
export const RANK_IMPORT_STYLE = 0
export const RANK_PLAYER_TEXT_MAX = 64
export const RANK_TITLE_MAX = 200
export const RANK_CHARTS_MAX = 20_000
export const RANK_IMPORT_MAX_BYTES = 2 * 1024 * 1024
export const RANK_UNMATCHED_PREVIEW_LIMIT = 5

export const RANK_API_PATHS = {
    session: '/api/extension/session',
    importRecords: '/api/import/records',
} as const

export const RANK_SESSION_TIMEOUT_MS = 10_000
export const RANK_IMPORT_TIMEOUT_MS = 25_000

export const RANK_SYNC_STATUSES = ['success', 'failed', 'skipped'] as const
export const RANK_SYNC_TRIGGERS = ['auto', 'manual'] as const
export const RANK_SESSION_ERRORS = ['network', 'server_error'] as const
export const RANK_SYNC_REASONS = [
    'not_logged_in',
    'dp_unsupported',
    'no_data',
    'origin_rejected',
    'rate_limited',
    'network',
    'server_error',
    'invalid_payload',
] as const

export type RankSyncStatus = (typeof RANK_SYNC_STATUSES)[number]
export type RankSyncTrigger = (typeof RANK_SYNC_TRIGGERS)[number]
export type RankSessionError = (typeof RANK_SESSION_ERRORS)[number]
export type RankSyncReason = (typeof RANK_SYNC_REASONS)[number]

const RankPlayerTextSchema = z.string().max(RANK_PLAYER_TEXT_MAX).nullable()
const RankCountSchema = z.number().int().nonnegative().nullable()
const RankRadarAxisSchema = z.number().nonnegative().nullable()

export const RankImportPlayerSchema = z
    .object({
        djName: RankPlayerTextSchema,
        iidxId: RankPlayerTextSchema,
        danRank: RankPlayerTextSchema,
        djPoint: z.number().nonnegative().nullable(),
        playCountSp: RankCountSchema,
        playCountDp: RankCountSchema,
    })
    .strict()

export const RankImportRadarSchema = z
    .object({
        NOTES: RankRadarAxisSchema,
        CHORD: RankRadarAxisSchema,
        PEAK: RankRadarAxisSchema,
        CHARGE: RankRadarAxisSchema,
        SCRATCH: RankRadarAxisSchema,
        'SOF-LAN': RankRadarAxisSchema,
    })
    .strict()

export const RankImportChartSchema = z
    .object({
        chartId: z.string().regex(/^chart-[a-f0-9]{32}$/),
        title: z.string().min(1).max(RANK_TITLE_MAX),
        difficulty: DifficultyCodeSchema,
        level: z.number().int().min(LEVEL_MIN).max(LEVEL_MAX),
        lamp: LampSchema,
        scoreGrade: DjLevelSchema.nullable(),
        exScore: RankCountSchema,
        missCount: RankCountSchema,
    })
    .strict()

export const RankImportSchema = z
    .object({
        version: z.literal(RANK_IMPORT_VERSION),
        kind: z.literal(RANK_IMPORT_KIND),
        generatedAt: z.string().datetime(),
        gameVersion: z.number().int().positive(),
        style: PlayStyleSchema,
        player: RankImportPlayerSchema.nullable(),
        notesRadar: RankImportRadarSchema.nullable(),
        charts: z.array(RankImportChartSchema).max(RANK_CHARTS_MAX),
    })
    .strict()

export type RankImportPlayer = z.infer<typeof RankImportPlayerSchema>
export type RankImportRadar = z.infer<typeof RankImportRadarSchema>
export type RankImportChart = z.infer<typeof RankImportChartSchema>
export type RankImport = z.infer<typeof RankImportSchema>

export const RankUserSchema = z.object({
    id: z.string().min(1),
    name: z.string(),
    handle: z.string().nullable(),
})

export type RankUser = z.infer<typeof RankUserSchema>

export const RankUnmatchedChartSchema = z.object({
    title: z.string(),
    difficulty: z.string(),
})

export const RankSessionResponseSchema = z.object({
    success: z.literal(true),
    data: z.object({ user: RankUserSchema.nullable() }),
})

export const RankImportResultSchema = z.object({
    importId: z.number().int(),
    channel: z.enum(['extension', 'file']),
    importedAt: z.string(),
    receivedCount: z.number().int().nonnegative(),
    matchedCount: z.number().int().nonnegative(),
    changedCount: z.number().int().nonnegative(),
    unmatched: z.array(RankUnmatchedChartSchema),
})

export type RankImportResult = z.infer<typeof RankImportResultSchema>

export const RankImportResponseSchema = z.object({
    success: z.literal(true),
    data: RankImportResultSchema,
})

export const RankErrorResponseSchema = z.object({
    success: z.literal(false),
    error: z.object({ code: z.string(), message: z.string() }),
})

export const RankSessionStateSchema = z.object({
    user: RankUserSchema.nullable(),
    checkedAt: z.string().datetime(),
    error: z.enum(RANK_SESSION_ERRORS).nullable(),
})

export type RankSessionState = z.infer<typeof RankSessionStateSchema>

export const RankSyncStateSchema = z.object({
    status: z.enum(RANK_SYNC_STATUSES),
    reason: z.enum(RANK_SYNC_REASONS).nullable(),
    trigger: z.enum(RANK_SYNC_TRIGGERS),
    at: z.string().datetime(),
    datasetGeneratedAt: z.string().datetime().nullable(),
    user: RankUserSchema.nullable(),
    importId: z.number().int().nullable(),
    importedAt: z.string().nullable(),
    receivedCount: RankCountSchema,
    matchedCount: RankCountSchema,
    changedCount: RankCountSchema,
    unmatchedCount: RankCountSchema,
    unmatchedPreview: z.array(RankUnmatchedChartSchema).max(RANK_UNMATCHED_PREVIEW_LIMIT),
    serverCode: z.string().nullable(),
})

export type RankSyncState = z.infer<typeof RankSyncStateSchema>

export const RankOverviewSchema = z.object({
    origin: z.string().url(),
    session: RankSessionStateSchema.nullable(),
    lastSync: RankSyncStateSchema.nullable(),
    isSyncing: z.boolean(),
})

export type RankOverview = z.infer<typeof RankOverviewSchema>
