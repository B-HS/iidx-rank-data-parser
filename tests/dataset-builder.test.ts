import { describe, expect, test } from 'bun:test'
import { buildDataset, sanitizeDataset } from '@core/dataset-builder'
import { DEFAULT_SETTINGS, DatasetSchema } from '@shared/schema'
import type { Chart } from '@shared/schema'
import { DATASET_FORMAT, DATASET_SCHEMA_VERSION, GAME_VERSION } from '@shared/constants'
import { toMessage } from '@shared/message-keys'
import type { NotesRadar, Player } from '@shared/schema'
import { chartIdFrom } from '@core/chart-id'

const meta = { pagesFetched: 1, failedLevels: [], warnings: [] }

const player: Player = {
    communityNickname: null,
    djName: '-TEST-',
    iidxId: '1234-5678',
    danRank: null,
    djPoint: null,
    playCountSp: null,
    playCountDp: null,
    playCountTotal: null,
    profile: [],
}

const notesRadar: NotesRadar = {
    values: { NOTES: 128.45, CHORD: null, PEAK: null, CHARGE: null, SCRATCH: null, 'SOF-LAN': null },
    raw: [],
    source: 'status',
    matchedByLabel: true,
}

const warningKeys = (dataset: { meta: { warnings: Array<{ key: string }> } }) => dataset.meta.warnings.map((warning) => warning.key)

const chart = async (title: string, lamp: Chart['lamp'] = 'CLEAR'): Promise<Chart> => ({
    chartId: await chartIdFrom(title, 'A'),
    title,
    difficultyName: 'ANOTHER',
    difficulty: 'A',
    level: 12,
    style: 0,
    djLevel: 'AA',
    exScore: 2000,
    pgreat: 900,
    great: 100,
    missCount: 5,
    lamp,
})

describe('buildDataset', () => {
    test('정상 결과를 그대로 저장한다', async () => {
        const dataset = buildDataset(player, notesRadar, [await chart('冥')], DEFAULT_SETTINGS, meta)

        expect(DatasetSchema.safeParse(dataset).success).toBe(true)
        expect(dataset.schemaVersion).toBe(DATASET_SCHEMA_VERSION)
        expect(dataset.meta.status).toBe('complete')
        expect(dataset.meta.warnings).toEqual([])
        expect(dataset.charts).toHaveLength(1)
    })

    test('수집 결과가 하나도 없으면 empty로 표시한다', () => {
        const dataset = buildDataset(player, notesRadar, [], DEFAULT_SETTINGS, meta)

        expect(dataset.meta.status).toBe('empty')
    })

    test('경고가 있으면 partial로 표시하고 경고를 키와 파라미터로 보존한다', () => {
        const warning = toMessage('warning_page_unexpected_page', { level: 12, offset: 50 })
        const dataset = buildDataset(player, notesRadar, [], DEFAULT_SETTINGS, { ...meta, warnings: [warning] })

        expect(dataset.meta.status).toBe('partial')
        expect(dataset.meta.warnings).toEqual([{ key: 'warning_page_unexpected_page', params: ['12', '50'] }])
    })

    test('검증을 통과하지 못한 차트만 제외하고 나머지를 저장한다', async () => {
        const valid = await chart('冥')
        const invalid = { ...valid, chartId: 'bad-id', level: 99 }
        const dataset = buildDataset(player, notesRadar, [valid, invalid as never], DEFAULT_SETTINGS, meta)

        expect(dataset.charts).toHaveLength(1)
        expect(dataset.meta.warnings).toEqual([{ key: 'warning_charts_dropped', params: ['1'] }])
        expect(dataset.meta.status).toBe('partial')
    })

    test('노트레이더 검증이 실패해도 차트 데이터는 저장하고 경고를 남긴다', async () => {
        const broken = { values: {}, raw: [{ label: '', value: '1' }], source: 'status', matchedByLabel: true }
        const dataset = buildDataset(player, broken as never, [await chart('冥')], DEFAULT_SETTINGS, meta)

        expect(dataset.charts).toHaveLength(1)
        expect(dataset.notesRadar).toBeNull()
        expect(warningKeys(dataset)).toEqual(['warning_radar_missing'])
        expect(dataset.meta.status).toBe('partial')
    })

    test('플레이어와 노트레이더를 읽지 못하면 완료로 표시하지 않는다', async () => {
        const emptyRadar = { ...notesRadar, values: { NOTES: null } }
        const dataset = buildDataset({ ...player, djName: null, iidxId: null }, emptyRadar, [await chart('冥')], DEFAULT_SETTINGS, meta)

        expect(warningKeys(dataset)).toEqual(['warning_player_missing', 'warning_radar_missing'])
        expect(dataset.meta.status).toBe('partial')
        expect(dataset.notesRadar).not.toBeNull()
    })
})

describe('sanitizeDataset', () => {
    test('빈 라벨을 가진 노트레이더는 저장 대상에서 제외한다', () => {
        const candidate = {
            format: DATASET_FORMAT,
            schemaVersion: DATASET_SCHEMA_VERSION,
            gameVersion: GAME_VERSION,
            player: null,
            notesRadar: { values: {}, raw: [{ label: '', value: '128' }], source: 'status', matchedByLabel: true },
            charts: [],
            meta: {
                status: 'complete' as const,
                generatedAt: null,
                finishedAt: null,
                gameVersion: GAME_VERSION,
                style: 0 as const,
                levels: [12],
                delay: { minMs: 500, maxMs: 1100 },
                pagesFetched: 0,
                failedLevels: [],
                warnings: [],
            },
        }

        const result = sanitizeDataset(candidate)

        expect(result.notesRadar).toBeNull()
        expect(result.charts).toHaveLength(0)
        expect(result.meta.warnings.map((warning) => warning.key)).toEqual(['warning_player_missing', 'warning_radar_missing'])
        expect(result.meta.status).toBe('partial')
    })
})
