import { DATASET_FORMAT, DATASET_SCHEMA_VERSION, DELAY_PROFILES, GAME_VERSION } from '@shared/constants'
import { ChartSchema, DatasetSchema, NotesRadarSchema, PlayerSchema } from '@shared/schema'
import type { Chart, Dataset, NotesRadar, Player, Settings } from '@shared/schema'

type DatasetMetaInput = Pick<Dataset['meta'], 'pagesFetched' | 'failedLevels' | 'warnings'>

export type DatasetCandidate = {
    format: string
    schemaVersion: number
    gameVersion: number
    player: unknown
    notesRadar: unknown
    charts: unknown[]
    meta: Dataset['meta']
}

const resolveStatus = (chartCount: number, warnings: string[]): Dataset['meta']['status'] => {
    if (warnings.length > 0) return 'partial'

    return chartCount === 0 ? 'empty' : 'complete'
}

/**
 * Salvages as much of a collection result as the schema allows.
 * Individual charts that fail validation are dropped instead of losing the
 * whole run, and the drop count is recorded as a warning.
 * @param candidate - assembled dataset before schema validation
 */
export const sanitizeDataset = (candidate: DatasetCandidate) => {
    const player = PlayerSchema.safeParse(candidate.player)
    const notesRadar = NotesRadarSchema.safeParse(candidate.notesRadar)
    const charts = candidate.charts.flatMap((chart) => {
        const parsed = ChartSchema.safeParse(chart)
        return parsed.success ? [parsed.data] : []
    })

    const dropped = candidate.charts.length - charts.length
    const warnings = dropped === 0 ? candidate.meta.warnings : [...candidate.meta.warnings, `${dropped}개 차트가 검증을 통과하지 못해 제외했습니다.`]

    return {
        format: candidate.format,
        schemaVersion: candidate.schemaVersion,
        gameVersion: candidate.gameVersion,
        player: player.success ? player.data : null,
        notesRadar: notesRadar.success ? notesRadar.data : null,
        charts,
        meta: { ...candidate.meta, status: resolveStatus(charts.length, warnings), warnings },
    }
}

/**
 * Builds the stored dataset and validates it.
 * A fully valid candidate is stored as-is. Otherwise the result is degraded
 * per-field so a partially parsable run can still be saved and exported.
 */
export const buildDataset = (player: Player | null, notesRadar: NotesRadar | null, charts: Chart[], settings: Settings, meta: DatasetMetaInput) => {
    const finishedAt = new Date().toISOString()
    const sanitized = sanitizeDataset({
        format: DATASET_FORMAT,
        schemaVersion: DATASET_SCHEMA_VERSION,
        gameVersion: GAME_VERSION,
        player,
        notesRadar,
        charts,
        meta: {
            status: resolveStatus(charts.length, meta.warnings),
            generatedAt: finishedAt,
            finishedAt,
            gameVersion: GAME_VERSION,
            style: settings.style,
            levels: settings.levels,
            delay: { minMs: DELAY_PROFILES[settings.delayProfile].minMs, maxMs: DELAY_PROFILES[settings.delayProfile].maxMs },
            pagesFetched: meta.pagesFetched,
            failedLevels: meta.failedLevels,
            warnings: meta.warnings,
        },
    })

    return DatasetSchema.parse(sanitized)
}
