import { describe, expect, test } from 'bun:test'
import { createRankClient } from '@core/rank-client'

type Call = { input: string; init: RequestInit }

const ORIGIN = 'https://rank.test'

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
