import { describe, expect, test } from 'bun:test'
import { RANK_IMPORT_MAX_BYTES } from '@shared/rank-schema'
import type { RankImport, RankImportResult } from '@shared/rank-schema'
import { createRankClient } from '@core/rank-client'

type Call = { input: string; init: RequestInit }

const ORIGIN = 'https://rank.test'

const payload: RankImport = {
    version: 2,
    kind: 'iidx-rank-import',
    generatedAt: '2026-10-07T10:05:00.000Z',
    gameVersion: 34,
    style: 0,
    player: null,
    notesRadar: null,
    charts: [],
}

const importResult: RankImportResult = {
    importId: 12,
    channel: 'extension',
    importedAt: '2026-10-07T10:05:03.000Z',
    receivedCount: 612,
    matchedCount: 598,
    changedCount: 41,
    unmatched: [{ title: '곡명', difficulty: 'A' }],
}

const clientWith = (respond: () => Promise<Response>) => {
    const calls: Call[] = []
    const client = createRankClient({
        origin: ORIGIN,
        fetch: async (input, init) => {
            calls.push({ input, init })
            return respond()
        },
    })

    return { client, calls }
}

const json =
    (body: unknown, status = 200) =>
    async () =>
        Response.json(body, { status })

describe('rankClient.getSession', () => {
    test('브라우저 세션 쿠키를 붙여 세션 사용자를 읽는다', async () => {
        const { client, calls } = clientWith(json({ success: true, data: { user: { id: 'u1', name: 'DJ', handle: 'dj' } } }))

        expect(await client.getSession()).toEqual({ ok: true, user: { id: 'u1', name: 'DJ', handle: 'dj' } })
        expect(calls).toHaveLength(1)
        expect(calls[0]?.input).toBe('https://rank.test/api/extension/session')
        expect(calls[0]?.init.method).toBe('GET')
        expect(calls[0]?.init.credentials).toBe('include')
        expect(calls[0]?.init.cache).toBe('no-store')
        expect(calls[0]?.init.headers).toBeUndefined()
    })

    test('세션이 없으면 사용자를 null로 돌려준다', async () => {
        const { client } = clientWith(json({ success: true, data: { user: null } }))

        expect(await client.getSession()).toEqual({ ok: true, user: null })
    })

    test('네트워크 실패와 서버 오류를 비로그인과 구분한다', async () => {
        const offline = clientWith(async () => Promise.reject(new TypeError('Failed to fetch')))
        const broken = clientWith(json({ success: false, error: { code: 'INTERNAL', message: 'x' } }, 500))
        const malformed = clientWith(json({ success: true, data: { user: { id: 1 } } }))
        const html = clientWith(async () => new Response('<html></html>', { status: 200 }))

        expect(await offline.client.getSession()).toEqual({ ok: false, error: 'network' })
        expect(await broken.client.getSession()).toEqual({ ok: false, error: 'server_error' })
        expect(await malformed.client.getSession()).toEqual({ ok: false, error: 'server_error' })
        expect(await html.client.getSession()).toEqual({ ok: false, error: 'server_error' })
    })
})

describe('rankClient.importRecords', () => {
    test('rank-import 본문을 JSON으로 보내고 결과를 검증해 돌려준다', async () => {
        const { client, calls } = clientWith(json({ success: true, data: importResult }))
        const result = await client.importRecords(payload)

        expect(result).toEqual({ ok: true, data: importResult })
        expect(calls[0]?.input).toBe('https://rank.test/api/import/records')
        expect(calls[0]?.init.method).toBe('POST')
        expect(calls[0]?.init.credentials).toBe('include')
        expect(calls[0]?.init.headers).toEqual({ 'Content-Type': 'application/json' })
        expect(calls[0]?.init.body).toBe(JSON.stringify(payload))
    })

    test('서버 오류 코드를 반영 사유 코드로 바꾼다', async () => {
        const reasonOf = async (code: string, status: number) => {
            const { client } = clientWith(json({ success: false, error: { code, message: 'x' } }, status))
            return client.importRecords(payload)
        }

        expect(await reasonOf('AUTH_REQUIRED', 401)).toEqual({ ok: false, reason: 'not_logged_in', serverCode: 'AUTH_REQUIRED' })
        expect(await reasonOf('ORIGIN_NOT_ALLOWED', 403)).toEqual({ ok: false, reason: 'origin_rejected', serverCode: 'ORIGIN_NOT_ALLOWED' })
        expect(await reasonOf('IMPORT_COOLDOWN', 429)).toEqual({ ok: false, reason: 'rate_limited', serverCode: 'IMPORT_COOLDOWN' })
        expect(await reasonOf('UNSUPPORTED_STYLE', 400)).toEqual({ ok: false, reason: 'dp_unsupported', serverCode: 'UNSUPPORTED_STYLE' })
        expect(await reasonOf('INVALID_INPUT', 400)).toEqual({ ok: false, reason: 'invalid_payload', serverCode: 'INVALID_INPUT' })
        expect(await reasonOf('SOMETHING_ELSE', 500)).toEqual({ ok: false, reason: 'server_error', serverCode: 'SOMETHING_ELSE' })
    })

    test('오류 본문을 읽지 못하면 상태 코드로 사유를 정한다', async () => {
        const forbidden = clientWith(async () => new Response('', { status: 403 }))
        const unknown = clientWith(async () => new Response('', { status: 502 }))

        expect(await forbidden.client.importRecords(payload)).toEqual({ ok: false, reason: 'origin_rejected', serverCode: null })
        expect(await unknown.client.importRecords(payload)).toEqual({ ok: false, reason: 'server_error', serverCode: null })
    })

    test('성공 상태여도 계약과 다른 응답은 서버 오류로 본다', async () => {
        const { client } = clientWith(json({ success: true, data: { importId: 'x' } }))

        expect(await client.importRecords(payload)).toEqual({ ok: false, reason: 'server_error', serverCode: null })
    })

    test('네트워크 실패를 사유 코드로 돌려준다', async () => {
        const { client } = clientWith(async () => Promise.reject(new TypeError('Failed to fetch')))

        expect(await client.importRecords(payload)).toEqual({ ok: false, reason: 'network', serverCode: null })
    })

    test('본문 크기 한도를 넘으면 보내지 않는다', async () => {
        const { client, calls } = clientWith(json({ success: true, data: importResult }))
        const oversized = {
            ...payload,
            player: { djName: 'x'.repeat(RANK_IMPORT_MAX_BYTES), iidxId: null, danRank: null, djPoint: null, playCountSp: null, playCountDp: null },
        }

        expect(await client.importRecords(oversized)).toEqual({ ok: false, reason: 'invalid_payload', serverCode: null })
        expect(calls).toHaveLength(0)
    })
})
