import { describe, expect, test } from 'bun:test'
import { DATASET_FORMAT, DATASET_SCHEMA_VERSION, GAME_VERSION } from '@shared/constants'
import { DatasetSchema, SettingsSchema } from '@shared/schema'
import { chartIdFrom } from '@core/chart-id'
import { toRankImport } from '@core/rank-export'

const buildDataset = async () =>
    DatasetSchema.parse({
        format: DATASET_FORMAT,
        schemaVersion: DATASET_SCHEMA_VERSION,
        gameVersion: GAME_VERSION,
        player: {
            communityNickname: 'TESTPLAYER',
            djName: '-TEST-',
            iidxId: '1234-5678',
            danRank: '十段',
            djPoint: 1234.56,
            playCountSp: 432,
            playCountDp: 123,
            playCountTotal: 555,
            profile: [],
        },
        notesRadar: {
            values: { NOTES: 128.45, CHORD: 131.22, PEAK: 118.9, CHARGE: 142, SCRATCH: 136.75, 'SOF-LAN': 124.1 },
            raw: [],
            source: 'status',
            matchedByLabel: true,
        },
        charts: [
            {
                chartId: await chartIdFrom('冥', 'A'),
                title: '冥',
                difficultyName: 'ANOTHER',
                difficulty: 'A',
                level: 12,
                style: 0,
                djLevel: 'AAA',
                exScore: 3123,
                pgreat: 1500,
                great: 123,
                missCount: 2,
                lamp: 'FULL_COMBO',
            },
        ],
        meta: {
            status: 'complete',
            generatedAt: '2026-10-06T10:00:00.000Z',
            finishedAt: '2026-10-06T10:05:00.000Z',
            gameVersion: GAME_VERSION,
            style: 0,
            levels: [12],
            delay: { minMs: 500, maxMs: 1100 },
            pagesFetched: 3,
            failedLevels: [],
            warnings: [],
        },
    })

describe('DatasetSchema', () => {
    test('수집 결과를 스키마로 검증한다', async () => {
        const dataset = await buildDataset()

        expect(dataset.charts).toHaveLength(1)
        expect(dataset.meta.status).toBe('complete')
        expect(dataset.charts[0]?.lamp).toBe('FULL_COMBO')
    })

    test('스키마 버전이 다른 데이터는 거부한다', async () => {
        const dataset = await buildDataset()
        const parsed = DatasetSchema.safeParse({ ...dataset, schemaVersion: 99 })

        expect(parsed.success).toBe(false)
    })
})

describe('SettingsSchema', () => {
    test('레벨이 비면 검증에 실패한다', () => {
        expect(SettingsSchema.safeParse({ style: 0, levels: [], delayProfile: 'normal' }).success).toBe(false)
    })

    test('범위 밖 레벨은 검증에 실패한다', () => {
        expect(SettingsSchema.safeParse({ style: 0, levels: [13], delayProfile: 'normal' }).success).toBe(false)
    })
})

describe('toRankImport', () => {
    test('iidx-rank가 소비하는 필드만 내보낸다', async () => {
        const dataset = await buildDataset()
        const payload = toRankImport(dataset)

        expect(payload.kind).toBe('iidx-rank-import')
        expect(payload.version).toBe(1)
        expect(payload.style).toBe(0)
        expect(payload.player).toEqual({ djName: '-TEST-', iidxId: '1234-5678' })
        expect(payload.charts).toHaveLength(1)

        const chart = payload.charts[0]
        expect(chart?.chartId).toMatch(/^chart-[a-f0-9]{32}$/)
        expect(chart?.scoreGrade).toBe('AAA')
        expect(chart?.lamp).toBe('FULL_COMBO')
        expect(chart?.level).toBe(12)
        expect(Object.keys(chart ?? {}).toSorted()).toEqual(['chartId', 'difficulty', 'exScore', 'lamp', 'level', 'missCount', 'scoreGrade', 'title'])
    })
})
