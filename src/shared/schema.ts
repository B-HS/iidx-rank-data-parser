import { z } from 'zod'
import { DATASET_FORMAT, DATASET_SCHEMA_VERSION } from '@shared/constants'
import { COLLECTION_STATUSES, DIFFICULTY_NAMES, DIFFICULTY_SHORT_CODES, DJ_LEVELS, LAMP_VALUES, PLAY_STYLES, RADAR_AXES } from '@shared/domain'
import type { CollectionStatus, DifficultyCode, DifficultyName, DjLevel, Lamp, PlayStyle, RadarAxis } from '@shared/domain'

export { DIFFICULTY_NAME_TO_CODE, LAMP_NAME_BY_INDEX } from '@shared/domain'
export { COLLECTION_STATUSES, DIFFICULTY_NAMES, DIFFICULTY_SHORT_CODES, DJ_LEVELS, LAMP_VALUES, PLAY_STYLES, RADAR_AXES } from '@shared/domain'

export const PlayStyleSchema = z.union([z.literal(PLAY_STYLES[0]), z.literal(PLAY_STYLES[1])])
export const DifficultyNameSchema = z.enum(DIFFICULTY_NAMES)
export const DifficultyCodeSchema = z.enum(DIFFICULTY_SHORT_CODES)
export const LampSchema = z.enum(LAMP_VALUES)
export const DjLevelSchema = z.enum(DJ_LEVELS)
export const CollectionStatusSchema = z.enum(COLLECTION_STATUSES)

export const PairSchema = z.object({
    label: z.string().min(1),
    value: z.string(),
})

export type Pair = z.infer<typeof PairSchema>

export const PlayerSchema = z.object({
    communityNickname: z.string().nullable(),
    djName: z.string().nullable(),
    iidxId: z.string().nullable(),
    danRank: z.string().nullable(),
    djPoint: z.number().nullable(),
    playCountSp: z.number().int().nullable(),
    playCountDp: z.number().int().nullable(),
    playCountTotal: z.number().int().nullable(),
    profile: z.array(PairSchema),
})

export type Player = z.infer<typeof PlayerSchema>

export const NotesRadarSchema = z.object({
    values: z.record(z.enum(RADAR_AXES), z.number().nullable()),
    raw: z.array(PairSchema),
    source: z.enum(['status', 'notesradar']).nullable(),
    matchedByLabel: z.boolean(),
})

export type NotesRadar = z.infer<typeof NotesRadarSchema>

export const ChartSchema = z.object({
    chartId: z.string().regex(/^chart-[a-f0-9]{32}$/),
    title: z.string().min(1),
    difficultyName: DifficultyNameSchema,
    difficulty: DifficultyCodeSchema,
    level: z.number().int().min(1).max(12),
    style: PlayStyleSchema,
    djLevel: DjLevelSchema.nullable(),
    exScore: z.number().int().nonnegative().nullable(),
    pgreat: z.number().int().nonnegative().nullable(),
    great: z.number().int().nonnegative().nullable(),
    missCount: z.number().int().nonnegative().nullable(),
    lamp: LampSchema,
})

export type Chart = z.infer<typeof ChartSchema>

export const DatasetMetaSchema = z.object({
    status: z.enum(['empty', 'partial', 'complete']),
    generatedAt: z.string().datetime().nullable(),
    finishedAt: z.string().datetime().nullable(),
    gameVersion: z.number().int(),
    style: PlayStyleSchema,
    levels: z.array(z.number().int()),
    delay: z.object({ minMs: z.number().int(), maxMs: z.number().int() }),
    pagesFetched: z.number().int().nonnegative(),
    failedLevels: z.array(z.number().int()),
    warnings: z.array(z.string()),
})

export type DatasetMeta = z.infer<typeof DatasetMetaSchema>

export const DatasetSchema = z.object({
    format: z.literal(DATASET_FORMAT),
    schemaVersion: z.literal(DATASET_SCHEMA_VERSION),
    gameVersion: z.number().int(),
    player: PlayerSchema.nullable(),
    notesRadar: NotesRadarSchema.nullable(),
    charts: z.array(ChartSchema),
    meta: DatasetMetaSchema,
})

export type Dataset = z.infer<typeof DatasetSchema>

export const CollectionStateSchema = z.object({
    status: CollectionStatusSchema,
    runId: z.string().nullable(),
    phase: z.string(),
    message: z.string(),
    percent: z.number().min(0).max(100),
    startedAt: z.string().datetime().nullable(),
    finishedAt: z.string().datetime().nullable(),
    error: z.string().nullable(),
    warnings: z.array(z.string()),
    chartCount: z.number().int().nonnegative(),
    pagesFetched: z.number().int().nonnegative(),
})

export type CollectionState = z.infer<typeof CollectionStateSchema>

export const LoginStateSchema = z.object({
    isLoggedIn: z.boolean(),
    checkedAt: z.string().datetime(),
    pageUrl: z.string(),
    communityNickname: z.string().nullable(),
    djName: z.string().nullable(),
})

export type LoginState = z.infer<typeof LoginStateSchema>

export const SettingsSchema = z.object({
    style: PlayStyleSchema,
    levels: z.array(z.number().int().min(1).max(12)).min(1),
    delayProfile: z.enum(['fast', 'normal', 'slow']),
})

export type Settings = z.infer<typeof SettingsSchema>

export const DEFAULT_SETTINGS: Settings = {
    style: 0,
    levels: [12],
    delayProfile: 'normal',
}

export type { CollectionStatus, DifficultyCode, DifficultyName, DjLevel, Lamp, PlayStyle, RadarAxis }
