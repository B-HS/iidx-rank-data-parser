import { DATASET_FORMAT, DATASET_SCHEMA_VERSION, GAME_VERSION } from '@shared/constants'
import { DatasetSchema } from '@shared/schema'
import type { Dataset } from '@shared/schema'
import { chartIdFrom } from '@core/chart-id'

export const DATASET_GENERATED_AT = '2026-10-07T10:05:00.000Z'

/**
 * Builds a stored dataset through the real schema.
 * @param overrides - play style and how many charts the dataset holds
 */
export const buildDataset = async (overrides: { style?: 0 | 1; chartCount?: number } = {}): Promise<Dataset> => {
    const style = overrides.style ?? 0
    const chart = {
        chartId: await chartIdFrom('冥', 'A'),
        title: '冥',
        difficultyName: 'ANOTHER',
        difficulty: 'A',
        level: 12,
        style,
        djLevel: 'AAA',
        exScore: 3123,
        pgreat: 1500,
        great: 123,
        missCount: null,
        lamp: 'FULL_COMBO',
    }

    return DatasetSchema.parse({
        format: DATASET_FORMAT,
        schemaVersion: DATASET_SCHEMA_VERSION,
        gameVersion: GAME_VERSION,
        player: null,
        notesRadar: null,
        charts: (overrides.chartCount ?? 1) === 0 ? [] : [chart],
        meta: {
            status: 'complete',
            generatedAt: DATASET_GENERATED_AT,
            finishedAt: DATASET_GENERATED_AT,
            gameVersion: GAME_VERSION,
            style,
            levels: [12],
            delay: { minMs: 500, maxMs: 1100 },
            pagesFetched: 1,
            failedLevels: [],
            warnings: [],
        },
    })
}
