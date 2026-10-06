import type { Chart, Dataset, DifficultyCode, DjLevel, Lamp } from '@shared/schema'

export type RankImportChart = {
    chartId: Chart['chartId']
    title: string
    difficulty: DifficultyCode
    level: number
    lamp: Lamp
    scoreGrade: DjLevel | null
    exScore: number | null
    missCount: number | null
}

export type RankImportPayload = {
    version: 1
    kind: 'iidx-rank-import'
    generatedAt: string
    gameVersion: number
    style: 0 | 1
    player: { djName: string | null; iidxId: string | null }
    charts: RankImportChart[]
}

/**
 * Builds the import payload consumed by the iidx-rank site.
 * Only fields that exist in both applications are included so that unknown
 * eagate chart variants cannot corrupt the receiving side.
 * @param dataset - normalized parser output
 */
export const toRankImport = (dataset: Dataset): RankImportPayload => ({
    version: 1,
    kind: 'iidx-rank-import',
    generatedAt: dataset.meta.generatedAt ?? new Date().toISOString(),
    gameVersion: dataset.gameVersion,
    style: dataset.meta.style,
    player: { djName: dataset.player?.djName ?? null, iidxId: dataset.player?.iidxId ?? null },
    charts: dataset.charts.map((chart) => ({
        chartId: chart.chartId,
        title: chart.title,
        difficulty: chart.difficulty,
        level: chart.level,
        lamp: chart.lamp,
        scoreGrade: chart.djLevel,
        exScore: chart.exScore,
        missCount: chart.missCount,
    })),
})
