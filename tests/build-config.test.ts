import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'bun:test'
import { z } from 'zod'
import { MANIFEST_MESSAGE_KEYS } from '@shared/message-keys'
import { DEFAULT_RANK_ORIGIN, RANK_ORIGIN, normalizeRankOrigin, toHostMatchPattern } from '@shared/rank-origin'
import { RANK_CONTENT_SCRIPT, buildManifest } from '../config/manifest'

const LOCALES = ['en', 'ko', 'ja']
const EAGATE_PATTERN = 'https://p.eagate.573.jp/*'

const LocaleMessagesSchema = z.record(z.object({ message: z.string().min(1) }))

const readLocale = (locale: string) =>
    LocaleMessagesSchema.parse(JSON.parse(readFileSync(resolve(import.meta.dir, '../public/_locales', locale, 'messages.json'), 'utf8')))

describe('RANK_ORIGIN', () => {
    test('빌드 주입이 없으면 기본 출처를 쓴다', () => {
        expect(RANK_ORIGIN).toBe(DEFAULT_RANK_ORIGIN)
        expect(normalizeRankOrigin(undefined)).toBe('https://iidx.hyns.dev')
        expect(normalizeRankOrigin('  ')).toBe('https://iidx.hyns.dev')
    })

    test('경로와 끝 슬래시를 뺀 출처로 정규화한다', () => {
        expect(normalizeRankOrigin('http://localhost:3000/')).toBe('http://localhost:3000')
        expect(normalizeRankOrigin('https://iidx.hyns.dev/settings?x=1')).toBe('https://iidx.hyns.dev')
    })

    test('http(s)가 아닌 값은 거부한다', () => {
        expect(() => normalizeRankOrigin('chrome-extension://abc')).toThrow()
        expect(() => normalizeRankOrigin('not a url')).toThrow()
    })

    test('출처를 host_permissions match pattern으로 바꾼다', () => {
        expect(toHostMatchPattern('http://localhost:3000')).toBe('http://localhost:3000/*')
        expect(toHostMatchPattern(DEFAULT_RANK_ORIGIN)).toBe('https://iidx.hyns.dev/*')
    })
})

describe('buildManifest', () => {
    test('e-amusement와 대상 iidx-rank 출처만 host_permissions에 둔다', () => {
        expect(buildManifest(DEFAULT_RANK_ORIGIN).host_permissions).toEqual([EAGATE_PATTERN, 'https://iidx.hyns.dev/*'])
        expect(buildManifest('http://localhost:3000').host_permissions).toEqual([EAGATE_PATTERN, 'http://localhost:3000/*'])
    })

    test('e-amusement용과 iidx-rank용 content script를 따로 등록한다', () => {
        const eagateScript = { matches: ['https://p.eagate.573.jp/game/2dx/*'], js: ['content-script.js'], run_at: 'document_idle' }

        expect(buildManifest(DEFAULT_RANK_ORIGIN).content_scripts).toEqual([
            eagateScript,
            { matches: ['https://iidx.hyns.dev/*'], js: [RANK_CONTENT_SCRIPT], run_at: 'document_idle' },
        ])
        expect(buildManifest('http://localhost:3000').content_scripts).toEqual([
            eagateScript,
            { matches: ['http://localhost:3000/*'], js: ['rank-content-script.js'], run_at: 'document_idle' },
        ])
    })

    test('정적 manifest에는 iidx-rank 출처가 없다', () => {
        const staticManifest = readFileSync(resolve(import.meta.dir, '../public/manifest.json'), 'utf8')

        expect(staticManifest).not.toContain('iidx.hyns.dev')
        expect(staticManifest).not.toContain(RANK_CONTENT_SCRIPT)
    })

    test('이름과 설명을 로케일 메시지로 참조한다', () => {
        const manifest = buildManifest(DEFAULT_RANK_ORIGIN)

        expect(manifest.default_locale).toBe('en')
        expect(manifest.name).toBe('__MSG_extName__')
        expect(manifest.description).toBe('__MSG_extDescription__')
    })

    test('API 권한은 storage만 요청하고 선택 권한을 두지 않는다', () => {
        const manifest = buildManifest(DEFAULT_RANK_ORIGIN)

        expect(manifest.permissions).toEqual(['storage'])
        expect(Object.keys(manifest)).not.toContain('optional_permissions')
        expect(Object.keys(manifest)).not.toContain('optional_host_permissions')
    })
})

describe('_locales', () => {
    test('모든 로케일에 manifest가 참조하는 키가 있다', () => {
        for (const locale of LOCALES) {
            const messages = readLocale(locale)

            expect(MANIFEST_MESSAGE_KEYS.every((key) => key in messages)).toBe(true)
        }
    })
})
