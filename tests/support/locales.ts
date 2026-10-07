import { z } from 'zod'
import en from '../../public/_locales/en/messages.json'
import ja from '../../public/_locales/ja/messages.json'
import ko from '../../public/_locales/ko/messages.json'

export const LOCALE_NAMES = ['ko', 'ja', 'en'] as const

export type LocaleName = (typeof LOCALE_NAMES)[number]

export const LocaleFileSchema = z.record(
    z.object({
        message: z.string(),
        placeholders: z.record(z.object({ content: z.string() })).optional(),
    }),
)

export const LOCALE_FILES = {
    ko: LocaleFileSchema.parse(ko),
    ja: LocaleFileSchema.parse(ja),
    en: LocaleFileSchema.parse(en),
} as const satisfies Record<LocaleName, z.infer<typeof LocaleFileSchema>>

const PLACEHOLDER_PATTERN = /\$(\w+)\$/g
const SUBSTITUTION_PATTERN = /^\$(\d)$/

/**
 * Builds a chrome.i18n stand-in that renders the real locale files.
 * Missing keys render as an empty string like the real API.
 * @param locale - locale folder to read messages from
 */
export const createI18nStub = (locale: LocaleName) => ({
    getMessage: (name: string, substitutions?: string | string[]) => {
        const entry = LOCALE_FILES[locale][name]
        if (entry === undefined) return ''

        const values = typeof substitutions === 'string' ? [substitutions] : (substitutions ?? [])

        return entry.message.replace(PLACEHOLDER_PATTERN, (_, placeholder: string) => {
            const content = entry.placeholders?.[placeholder.toLowerCase()]?.content ?? ''
            const index = Number(SUBSTITUTION_PATTERN.exec(content)?.[1] ?? 0) - 1

            return values[index] ?? ''
        })
    },
    getUILanguage: () => locale,
})
