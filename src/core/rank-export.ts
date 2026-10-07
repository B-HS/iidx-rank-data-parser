import type { RadarAxis } from '@shared/domain'
import { RANK_IMPORT_KIND, RANK_IMPORT_VERSION, RANK_PLAYER_TEXT_MAX, RankImportChartSchema } from '@shared/rank-schema'
import type { RankImport, RankImportPlayer, RankImportRadar } from '@shared/rank-schema'
import type { Dataset, NotesRadar, Player } from '@shared/schema'
import { hasRadarValues } from '@core/collection-flow'

const toPlayerText = (value: string | null) => (value !== null && value.length <= RANK_PLAYER_TEXT_MAX ? value : null)

const toNonNegative = (value: number | null) => (value !== null && value >= 0 ? value : null)

const toRankPlayer = (player: Player | null): RankImportPlayer | null => {
    if (player === null) return null

    return {
        djName: toPlayerText(player.djName),
        iidxId: toPlayerText(player.iidxId),
        danRank: toPlayerText(player.danRank),
        djPoint: toNonNegative(player.djPoint),
        playCountSp: toNonNegative(player.playCountSp),
        playCountDp: toNonNegative(player.playCountDp),
    }
}

const toRankRadar = (radar: NotesRadar | null): RankImportRadar | null => {
    if (!hasRadarValues(radar) || !radar.matchedByLabel) return null

    const axisValue = (axis: RadarAxis) => toNonNegative(radar.values[axis] ?? null)

    return {
        NOTES: axisValue('NOTES'),
        CHORD: axisValue('CHORD'),
        PEAK: axisValue('PEAK'),
        CHARGE: axisValue('CHARGE'),
        SCRATCH: axisValue('SCRATCH'),
        'SOF-LAN': axisValue('SOF-LAN'),
    }
}

/**
 * Builds the rank-import v2 body consumed by the iidx-rank site.
 * Only collected values are sent. A notes radar that was inferred by order
 * instead of matched by axis label is left out, over-length player strings
 * become null, and charts that violate the contract are dropped.
 * @param dataset - normalized parser output
 */
export const toRankImport = (dataset: Dataset): RankImport => ({
    version: RANK_IMPORT_VERSION,
    kind: RANK_IMPORT_KIND,
    generatedAt: dataset.meta.generatedAt ?? new Date().toISOString(),
    gameVersion: dataset.gameVersion,
    style: dataset.meta.style,
    player: toRankPlayer(dataset.player),
    notesRadar: toRankRadar(dataset.notesRadar),
    charts: dataset.charts.flatMap((chart) => {
        const parsed = RankImportChartSchema.safeParse({
            chartId: chart.chartId,
            title: chart.title,
            difficulty: chart.difficulty,
            level: chart.level,
            lamp: chart.lamp,
            scoreGrade: chart.djLevel,
            exScore: chart.exScore,
            missCount: chart.missCount,
        })

        return parsed.success ? [parsed.data] : []
    }),
})
