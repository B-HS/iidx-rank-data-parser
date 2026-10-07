import { describe, expect, test } from 'bun:test'
import { DATASET_FORMAT, DATASET_SCHEMA_VERSION, GAME_VERSION } from '@shared/constants'
import { DatasetSchema, SettingsSchema } from '@shared/schema'
import { chartIdFrom } from '@core/chart-id'
import { RANK_PLAYER_TEXT_MAX, RANK_TITLE_MAX, RankImportSchema } from '@shared/rank-schema'
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

    test('중복된 레벨과 모르는 간격 설정은 검증에 실패한다', () => {
        expect(SettingsSchema.safeParse({ style: 0, levels: [12, 12], delayProfile: 'normal' }).success).toBe(false)
        expect(SettingsSchema.safeParse({ style: 0, levels: [12], delayProfile: 'instant' }).success).toBe(false)
    })
})

describe('toRankImport', () => {
    test('rank-import v2 계약 본문을 만든다', async () => {
        const payload = toRankImport(await buildDataset())

        expect(RankImportSchema.safeParse(payload).success).toBe(true)
        expect(payload.kind).toBe('iidx-rank-import')
        expect(payload.version).toBe(2)
        expect(payload.generatedAt).toBe('2026-10-06T10:00:00.000Z')
        expect(payload.gameVersion).toBe(GAME_VERSION)
        expect(payload.style).toBe(0)
        expect(payload.player).toEqual({
            djName: '-TEST-',
            iidxId: '1234-5678',
            danRank: '十段',
            djPoint: 1234.56,
            playCountSp: 432,
            playCountDp: 123,
        })
        expect(payload.notesRadar).toEqual({ NOTES: 128.45, CHORD: 131.22, PEAK: 118.9, CHARGE: 142, SCRATCH: 136.75, 'SOF-LAN': 124.1 })
        expect(payload.charts).toEqual([
            {
                chartId: 'chart-6d4d8c5dd256f3870c3527063b541f01',
                title: '冥',
                difficulty: 'A',
                level: 12,
                lamp: 'FULL_COMBO',
                scoreGrade: 'AAA',
                exScore: 3123,
                missCount: 2,
            },
        ])
        expect(Object.keys(payload).toSorted()).toEqual(['charts', 'gameVersion', 'generatedAt', 'kind', 'notesRadar', 'player', 'style', 'version'])
    })

    test('플레이어와 노트레이더가 없으면 null로 보낸다', async () => {
        const dataset = await buildDataset()
        const payload = toRankImport({ ...dataset, player: null, notesRadar: null })

        expect(payload.player).toBeNull()
        expect(payload.notesRadar).toBeNull()
        expect(RankImportSchema.safeParse(payload).success).toBe(true)
    })

    test('라벨로 확인하지 못한 노트레이더는 보내지 않는다', async () => {
        const dataset = await buildDataset()
        const guessed = dataset.notesRadar === null ? null : { ...dataset.notesRadar, matchedByLabel: false }

        expect(toRankImport({ ...dataset, notesRadar: guessed }).notesRadar).toBeNull()
    })

    test('값이 하나도 없는 노트레이더는 보내지 않는다', async () => {
        const dataset = await buildDataset()
        const empty = dataset.notesRadar === null ? null : { ...dataset.notesRadar, values: { NOTES: null, CHORD: null } }

        expect(toRankImport({ ...dataset, notesRadar: empty }).notesRadar).toBeNull()
    })

    test('계약 길이를 넘는 플레이어 문자열은 null로 보낸다', async () => {
        const dataset = await buildDataset()
        const player = dataset.player === null ? null : { ...dataset.player, danRank: '段'.repeat(RANK_PLAYER_TEXT_MAX + 1) }
        const payload = toRankImport({ ...dataset, player })

        expect(payload.player?.danRank).toBeNull()
        expect(payload.player?.djName).toBe('-TEST-')
    })

    test('계약 길이를 넘는 곡명의 차트는 제외한다', async () => {
        const dataset = await buildDataset()
        const [chart] = dataset.charts
        const charts = chart === undefined ? [] : [chart, { ...chart, title: 'A'.repeat(RANK_TITLE_MAX + 1) }]

        expect(toRankImport({ ...dataset, charts }).charts).toHaveLength(1)
    })
})

describe('RankImportSchema', () => {
    test('모르는 필드는 거부한다', async () => {
        const payload = toRankImport(await buildDataset())

        expect(RankImportSchema.safeParse({ ...payload, extra: true }).success).toBe(false)
        expect(RankImportSchema.safeParse({ ...payload, player: { ...payload.player, communityNickname: 'X' } }).success).toBe(false)
    })

    test('음수 노트레이더 값은 거부한다', async () => {
        const payload = toRankImport(await buildDataset())

        expect(RankImportSchema.safeParse({ ...payload, notesRadar: { ...payload.notesRadar, NOTES: -1 } }).success).toBe(false)
    })

    test('버전이 다른 본문은 거부한다', async () => {
        const payload = toRankImport(await buildDataset())

        expect(RankImportSchema.safeParse({ ...payload, version: 1 }).success).toBe(false)
    })
})
