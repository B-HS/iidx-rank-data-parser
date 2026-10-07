import { describe, expect, test } from 'bun:test'
import { Glob } from 'bun'
import { DELAY_PROFILES } from '@shared/constants'
import { POPUP_MESSAGE_KEYS, TRANSLATION_PARAMS } from '@shared/i18n'
import { MANIFEST_MESSAGE_KEYS, MESSAGE_KEYS } from '@shared/message-keys'
import { LOCALE_FILES, LOCALE_NAMES } from './support/locales'

const EXPECTED_KEYS = [...MANIFEST_MESSAGE_KEYS, ...MESSAGE_KEYS, ...POPUP_MESSAGE_KEYS].toSorted()
const PLACEHOLDER_PATTERN = /\$(\w+)\$/g
const KEY_CALL_PATTERN = /\b(?:t|toMessage)\(\s*'([A-Za-z0-9_]+)'/g
const MANIFEST_REFERENCE_PATTERN = /__MSG_(\w+)__/g
const CJK_PATTERN = /[぀-ヿ㐀-鿿가-힯]/
const UI_SOURCE_DIRECTORIES = ['src/features', 'src/widgets', 'src/ui', 'src/popup']

const readSourceFiles = async (directories: string[]) => {
    const files: { path: string; text: string }[] = []

    for (const directory of directories) {
        for await (const path of new Glob('**/*.{ts,tsx}').scan(directory)) {
            files.push({ path: `${directory}/${path}`, text: await Bun.file(`${directory}/${path}`).text() })
        }
    }

    return files
}

describe('locale files', () => {
    test('세 로케일의 키 집합이 같고 코드가 정의한 키와 정확히 일치한다', () => {
        for (const locale of LOCALE_NAMES) {
            expect(Object.keys(LOCALE_FILES[locale]).toSorted()).toEqual(EXPECTED_KEYS)
        }
    })

    test('모든 메시지가 비어 있지 않다', () => {
        for (const locale of LOCALE_NAMES) {
            const empty = Object.entries(LOCALE_FILES[locale]).filter(([, entry]) => entry.message.trim() === '')

            expect(empty.map(([key]) => `${locale}:${key}`)).toEqual([])
        }
    })

    test('placeholder 이름과 순서가 코드의 파라미터 정의와 같다', () => {
        for (const locale of LOCALE_NAMES) {
            for (const [key, names] of Object.entries(TRANSLATION_PARAMS)) {
                const entry = LOCALE_FILES[locale][key]
                const used = [...(entry?.message.matchAll(PLACEHOLDER_PATTERN) ?? [])].map((match) => match[1].toLowerCase())
                const declared = Object.keys(entry?.placeholders ?? {}).toSorted()

                expect({ locale, key, used: [...new Set(used)].toSorted() }).toEqual({ locale, key, used: [...names].toSorted() })
                expect({ locale, key, declared }).toEqual({ locale, key, declared: [...names].toSorted() })
                names.forEach((name, index) => {
                    expect(entry?.placeholders?.[name]?.content).toBe(`$${index + 1}`)
                })
            }
        }
    })

    test('manifest가 참조하는 메시지가 모두 존재한다', async () => {
        const manifest = await Bun.file('public/manifest.json').text()
        const referenced = [...manifest.matchAll(MANIFEST_REFERENCE_PATTERN)].map((match) => match[1])

        expect(referenced.length).toBeGreaterThan(0)
        for (const locale of LOCALE_NAMES) {
            expect(referenced.filter((key) => LOCALE_FILES[locale][key] === undefined)).toEqual([])
        }
    })
})

describe('source usage', () => {
    test('코드가 t()와 toMessage()로 쓰는 키가 모두 정의되어 있다', async () => {
        const files = await readSourceFiles(['src'])
        const used = files.flatMap(({ path, text }) => [...text.matchAll(KEY_CALL_PATTERN)].map((match) => ({ path, key: match[1] })))
        const defined: readonly string[] = EXPECTED_KEYS

        expect(used.length).toBeGreaterThan(0)
        expect(used.filter(({ key }) => !defined.includes(key))).toEqual([])
    })

    test('지연 프로필의 라벨 키가 정의되어 있다', () => {
        const defined: readonly string[] = EXPECTED_KEYS

        expect(Object.values(DELAY_PROFILES).every((profile) => defined.includes(profile.labelKey))).toBe(true)
    })

    test('popup 화면 코드에 한국어·일본어 문구가 하드코딩되어 있지 않다', async () => {
        const files = await readSourceFiles(UI_SOURCE_DIRECTORIES)

        expect(files.length).toBeGreaterThan(0)
        expect(files.filter(({ text }) => CJK_PATTERN.test(text)).map(({ path }) => path)).toEqual([])
    })
})
