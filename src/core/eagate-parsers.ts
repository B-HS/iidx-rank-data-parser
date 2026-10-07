import { DIFFICULTY_NAME_TO_CODE, DJ_LEVELS, LAMP_NAME_BY_INDEX, RADAR_AXES } from '@shared/domain'
import type { Chart, DifficultyCode, DifficultyName, DjLevel, Lamp, NotesRadar, Pair, Player, RadarAxis } from '@shared/schema'

export type ParsedChart = Omit<Chart, 'chartId'>

export type DifficultyPageResult = {
    charts: ParsedChart[]
    isNoData: boolean
    requiresLogin: boolean
}

export type StatusPageResult = {
    player: Player
    notesRadar: NotesRadar
}

export type LoginPageResult = {
    isLoggedIn: boolean
    communityNickname: string | null
    djName: string | null
}

export type RadarSource = NotesRadar['source']

const NO_DATA_MARKER = 'データがみつかりません'
const PLACEHOLDER_PATTERN = /^-{2,}$/
const DIFFICULTY_COLUMN_COUNT = 5

const normalizeText = (value: string | null | undefined) => (value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim()

const elementText = (element: Element | null | undefined) => normalizeText(element?.textContent)

const isPlaceholder = (value: string) => value === '' || value === '---' || PLACEHOLDER_PATTERN.test(value)

const parseUserStatusFlag = (doc: Document) => {
    for (const script of Array.from(doc.querySelectorAll('script'))) {
        const match = (script.textContent ?? '').match(/"login"\s*:\s*(true|false)/)
        if (match?.[1] !== undefined) return match[1] === 'true'
    }

    return null
}

export const isLoginRequiredPage = (doc: Document) => doc.querySelector('#error-page .error_login') !== null || parseUserStatusFlag(doc) === false

export const parseLoginState = (doc: Document): LoginPageResult => {
    const names = new Map<string, string>()

    for (const list of Array.from(doc.querySelectorAll('#log-on .on-name'))) {
        const items = Array.from(list.querySelectorAll('li')).map((item) => elementText(item))
        const label = items[0]
        const value = items[1]
        if (label !== undefined && value !== undefined && label !== '') names.set(label, value)
    }

    const findByPattern = (pattern: RegExp) => {
        for (const [label, value] of names) {
            if (pattern.test(label)) return value
        }
        return null
    }

    const requiresLogin = doc.querySelector('#error-page .error_login') !== null
    const flag = parseUserStatusFlag(doc)
    const namesPresent = names.size > 0
    const namesFilled = Array.from(names.values()).some((value) => !isPlaceholder(value))
    const isLoggedIn = requiresLogin ? false : (flag ?? (namesPresent && namesFilled))

    const resolveName = (pattern: RegExp) => {
        if (!isLoggedIn) return null
        const value = findByPattern(pattern)
        return value !== null && !isPlaceholder(value) ? value : null
    }

    return {
        isLoggedIn,
        communityNickname: resolveName(/コミュニティ/),
        djName: resolveName(/DJ\s*NAME/i),
    }
}

const EMPTY_RADAR_VALUES = (): Record<RadarAxis, number | null> => ({
    NOTES: null,
    CHORD: null,
    PEAK: null,
    CHARGE: null,
    SCRATCH: null,
    'SOF-LAN': null,
})

const AXIS_PATTERNS = {
    NOTES: /^NOTES$/i,
    CHORD: /^CHORD$/i,
    PEAK: /^PEAK$/i,
    CHARGE: /^CHARGE$/i,
    SCRATCH: /^SCRATCH$/i,
    'SOF-LAN': /^SOF-?LAN$/i,
} as const satisfies Record<RadarAxis, RegExp>

const matchRadarAxis = (label: string) => {
    const normalized = normalizeText(label).replace(/\s+/g, '')
    for (const axis of RADAR_AXES) {
        if (AXIS_PATTERNS[axis].test(normalized)) return axis
    }

    return null
}

const parseRadarValue = (value: string) => {
    const normalized = normalizeText(value)
    if (normalized === '' || PLACEHOLDER_PATTERN.test(normalized)) return null

    const match = normalized.match(/-?\d+(?:\.\d+)?/)
    if (match === null) return null

    const parsed = Number.parseFloat(match[0])
    return Number.isFinite(parsed) ? parsed : null
}

const pairFromParagraphs = (item: Element): Pair | null => {
    const paragraphs = Array.from(item.querySelectorAll('p'))
    if (paragraphs.length < 2) return null

    const first = paragraphs[0]
    const second = paragraphs[1]
    if (first === undefined || second === undefined) return null

    return { label: elementText(first), value: elementText(second) }
}

const MAX_RAW_PAIRS = 64

const sanitizePairs = (pairs: Pair[]) => pairs.filter((pair) => pair.label !== '').slice(0, MAX_RAW_PAIRS)

const pairsFromListItems = (parent: ParentNode, selector: string) =>
    Array.from(parent.querySelectorAll(selector)).flatMap((item) => {
        const pair = pairFromParagraphs(item)
        return pair === null ? [] : [pair]
    })

const pairsFromDefinitionList = (parent: ParentNode) => {
    const terms = Array.from(parent.querySelectorAll('dt'))
    return terms.flatMap((term) => {
        const definition = term.nextElementSibling
        if (definition == null || definition.tagName !== 'DD') return []
        return [{ label: elementText(term), value: elementText(definition) }]
    })
}

const pairsFromTable = (parent: ParentNode, selector: string) =>
    Array.from(parent.querySelectorAll(selector)).flatMap((row) => {
        const cells = Array.from(row.querySelectorAll('td, th'))
        const first = cells[0]
        if (first === undefined || cells.length < 2) return []

        const rest = cells.slice(1)
        return [
            {
                label: elementText(first),
                value: rest
                    .map((cell) => elementText(cell))
                    .filter((text) => text !== '')
                    .join(' '),
            },
        ]
    })

const radarFromPairs = (pairs: Pair[]) => {
    const values = EMPTY_RADAR_VALUES()
    let matchedByLabel = false
    let labeled = 0

    for (const pair of pairs) {
        const axis = matchRadarAxis(pair.label)
        if (axis === null) continue

        labeled += 1
        if (values[axis] === null) values[axis] = parseRadarValue(pair.value)
    }

    matchedByLabel = labeled > 0

    if (!matchedByLabel) {
        const numericPairs = pairs.filter((pair) => parseRadarValue(pair.value) !== null).slice(0, RADAR_AXES.length)
        if (numericPairs.length === RADAR_AXES.length) {
            RADAR_AXES.forEach((axis, index) => {
                values[axis] = parseRadarValue(numericPairs[index]?.value ?? '')
            })
        }
    }

    return { values, matchedByLabel }
}

const radarFromText = (container: Element | null) => {
    const values = EMPTY_RADAR_VALUES()
    if (container == null) return values

    const text = normalizeText(container.textContent)
    for (const axis of RADAR_AXES) {
        const pattern = new RegExp(`${axis === 'SOF-LAN' ? 'SOF-?LAN' : axis}\\s*[:：]?\\s*(-?\\d+(?:\\.\\d+)?)`, 'i')
        const match = text.match(pattern)
        if (match?.[1] !== undefined) values[axis] = Number.parseFloat(match[1])
    }

    return values
}

const hasRadarValues = (values: Record<RadarAxis, number | null>) => RADAR_AXES.some((axis) => values[axis] !== null)

export const parseRadarSection = (doc: Document, source: RadarSource): NotesRadar => {
    const roots = ['#notes', '#radar', '.dj-status'].map((selector) => doc.querySelector(selector)).filter((root): root is Element => root !== null)
    const scope = roots[0] ?? doc.body
    const pairs = sanitizePairs([...pairsFromListItems(scope, 'ul li'), ...pairsFromDefinitionList(scope), ...pairsFromTable(scope, 'table tr')])

    const fromPairs = radarFromPairs(pairs)
    if (hasRadarValues(fromPairs.values)) {
        return { values: fromPairs.values, raw: pairs, source, matchedByLabel: fromPairs.matchedByLabel }
    }

    const fromText = radarFromText(scope)
    if (hasRadarValues(fromText)) {
        return { values: fromText, raw: pairs, source, matchedByLabel: fromPairs.matchedByLabel }
    }

    return { values: fromPairs.values, raw: pairs, source, matchedByLabel: fromPairs.matchedByLabel }
}

const RADAR_JSON_KEYS = new Map<string, RadarAxis>([
    ['NOTES', 'NOTES'],
    ['CHORD', 'CHORD'],
    ['PEAK', 'PEAK'],
    ['CHARGE', 'CHARGE'],
    ['SCRATCH', 'SCRATCH'],
    ['SOFLAN', 'SOF-LAN'],
    ['SOF-LAN', 'SOF-LAN'],
])

const collectRadarJsonPairs = (value: unknown, pairs: Pair[]) => {
    if (Array.isArray(value)) {
        for (const item of value) collectRadarJsonPairs(item, pairs)
        return
    }

    if (typeof value !== 'object' || value === null) return

    const record = value as Record<string, unknown>
    const rawLabel = [record.name, record.label, record.axis, record.key, record.type].find((candidate) => typeof candidate === 'string')
    const rawValue = [record.value, record.score, record.point, record.rate].find(
        (candidate) => typeof candidate === 'number' || (typeof candidate === 'string' && /-?\d/.test(candidate)),
    )

    if (typeof rawLabel === 'string' && rawLabel !== '' && rawValue !== undefined) {
        pairs.push({ label: rawLabel, value: String(rawValue) })
    }

    for (const [key, item] of Object.entries(record)) {
        const axis = RADAR_JSON_KEYS.get(key.replace(/\s+/g, '').toUpperCase())
        if (axis !== undefined && (typeof item === 'number' || typeof item === 'string')) {
            pairs.push({ label: axis, value: String(item) })
            continue
        }

        collectRadarJsonPairs(item, pairs)
    }
}

/**
 * Extracts player notes radar values from the ajax payload of the notes radar page.
 * The payload shape is not documented, so extraction walks objects and arrays
 * for axis names and numeric values instead of assuming a fixed structure.
 */
export const parseRadarJson = (payload: unknown, source: RadarSource): NotesRadar => {
    const pairs: Pair[] = []
    collectRadarJsonPairs(payload, pairs)
    const sanitized = sanitizePairs(pairs)
    const { values, matchedByLabel } = radarFromPairs(sanitized)

    return { values, raw: sanitized, source, matchedByLabel }
}

const findPairValue = (pairs: Pair[], pattern: RegExp) => pairs.find((pair) => pattern.test(pair.label))?.value ?? null

const NUMBER_PATTERN = /-?\d[\d,]*(?:\.\d+)?/

const firstNumber = (value: string | null) => {
    if (value === null) return null
    const match = value.replace(/\s+/g, '').match(NUMBER_PATTERN)
    if (match === null) return null

    const parsed = Number.parseFloat(match[0].replace(/,/g, ''))
    return Number.isFinite(parsed) ? parsed : null
}

const firstInteger = (value: string | null) => {
    const number = firstNumber(value)
    return number === null ? null : Math.trunc(number)
}

const matchIntegerAfter = (value: string | null, pattern: RegExp) => {
    if (value === null) return null
    const match = value.match(pattern)
    if (match?.[1] === undefined) return null

    const parsed = Number.parseInt(match[1].replace(/,/g, ''), 10)
    return Number.isFinite(parsed) ? parsed : null
}

const parseStatusPairs = (doc: Document) => {
    const pairs: Pair[] = []

    for (const row of Array.from(doc.querySelectorAll('.dj-status .dj-profile table tr'))) {
        const cells = Array.from(row.querySelectorAll('td'))
        const first = cells[0]
        if (first === undefined || cells.length < 2) continue

        const label = elementText(first)
        const value = cells
            .slice(1)
            .map((cell) => elementText(cell))
            .filter((text) => text !== '')
            .join(' ')

        if (label !== '') pairs.push({ label, value })
    }

    const sections = Array.from(doc.querySelectorAll('.dj-status .dj-rank'))

    for (const section of sections) {
        if (section.id === 'notes') continue

        const sectionTitle = elementText(section.querySelector('.cat-name'))
        for (const entry of Array.from(section.querySelectorAll('.rank-cat, .point-cat, .visit-cat'))) {
            const cells = Array.from(entry.children).filter((child) => child.tagName === 'DIV')
            const first = cells[0]
            if (first === undefined) continue

            const label = elementText(first)
            const value = cells
                .slice(1)
                .map((cell) => elementText(cell))
                .filter((text) => text !== '')
                .join(' ')

            if (label !== '') pairs.push({ label: sectionTitle === '' ? label : `${sectionTitle} / ${label}`, value })
        }
    }

    return pairs
}

export const parseStatusPage = (doc: Document): StatusPageResult => {
    const pairs = parseStatusPairs(doc)
    const loginNames = parseLoginState(doc)
    const djNameFromProfile = findPairValue(pairs, /DJ\s*NAME/i)
    const playCountValue = findPairValue(pairs, /プレー回数|プレイ回数|プレイ数/)
    const totalPlayCount = playCountValue === null ? null : matchIntegerAfter(playCountValue, /(?:合計|トータル|TOTAL)\s*[:：]?\s*([\d,]+)/i)

    const player: Player = {
        communityNickname: loginNames.communityNickname,
        djName: loginNames.djName ?? (djNameFromProfile !== null && !isPlaceholder(djNameFromProfile) ? djNameFromProfile : null),
        iidxId: findPairValue(pairs, /IIDX\s*ID/i),
        danRank: findPairValue(pairs, /段位/),
        djPoint: firstNumber(findPairValue(pairs, /DJ\s*POINT/i)),
        playCountSp: matchIntegerAfter(playCountValue, /SP\s*[:：]?\s*([\d,]+)/i),
        playCountDp: matchIntegerAfter(playCountValue, /DP\s*[:：]?\s*([\d,]+)/i),
        playCountTotal: totalPlayCount ?? firstInteger(playCountValue),
        profile: pairs,
    }

    return { player, notesRadar: parseRadarSection(doc, 'status') }
}

const matchDifficultyName = (value: string): DifficultyName | null => {
    const normalized = normalizeText(value).toUpperCase()
    const names = Object.keys(DIFFICULTY_NAME_TO_CODE) as DifficultyName[]

    return names.find((name) => name === normalized) ?? null
}

const matchDjLevel = (cell: Element | null): DjLevel | null => {
    if (cell == null) return null

    for (const image of Array.from(cell.querySelectorAll('img'))) {
        const source = image.getAttribute('src') ?? ''
        const file = source.split('/').at(-1) ?? ''
        const code = file.replace(/\.gif$/i, '').toUpperCase()
        const level = DJ_LEVELS.find((candidate) => candidate === code)
        if (level !== undefined) return level
    }

    const text = elementText(cell).toUpperCase()
    return DJ_LEVELS.find((candidate) => candidate === text) ?? null
}

const findLamp = (row: Element): Lamp | null => {
    for (const image of Array.from(row.querySelectorAll('img'))) {
        const source = image.getAttribute('src') ?? ''
        const match = source.match(/clflg(\d)\.gif/i)
        if (match?.[1] === undefined) continue

        const index = Number.parseInt(match[1], 10)
        const lamp = LAMP_NAME_BY_INDEX[index as keyof typeof LAMP_NAME_BY_INDEX]
        if (lamp !== undefined) return lamp
    }

    return null
}

const parseScore = (value: string) => {
    const normalized = normalizeText(value)
    const detailed = normalized.match(/^(\d+)\s*\(\s*(\d+)\s*\/\s*(\d+)\s*\)/)
    if (detailed !== null) {
        return {
            exScore: Number.parseInt(detailed[1] ?? '', 10),
            pgreat: Number.parseInt(detailed[2] ?? '', 10),
            great: Number.parseInt(detailed[3] ?? '', 10),
        }
    }

    const single = normalized.match(/^(\d+)/)
    return {
        exScore: single?.[1] !== undefined ? Number.parseInt(single[1], 10) : null,
        pgreat: null,
        great: null,
    }
}

const parseMissCount = (row: Element) => {
    const text = normalizeText(row.textContent)
    const match = text.match(/(?:BP|MISS|BAD)\s*[:：]?\s*(\d+)/i)
    if (match?.[1] === undefined) return null

    const parsed = Number.parseInt(match[1], 10)
    return Number.isFinite(parsed) ? parsed : null
}

/**
 * Parses one page of the level based chart list.
 * @param doc - server rendered difficulty page
 * @param level - game level requested for this page
 * @param style - 0 for SP, 1 for DP
 */
export const parseDifficultyPage = (doc: Document, level: number, style: 0 | 1): DifficultyPageResult => {
    const table = doc.querySelector('div.series-difficulty table')
    const requiresLogin = isLoginRequiredPage(doc)
    const notice = elementText(doc.querySelector('.music-notice, #base .music-notice'))
    const isNoData = table == null && notice.includes(NO_DATA_MARKER)

    if (table == null) return { charts: [], isNoData, requiresLogin }

    const charts = Array.from(table.querySelectorAll('tr')).flatMap((row) => {
        const cells = Array.from(row.querySelectorAll('td'))
        if (cells.length < DIFFICULTY_COLUMN_COUNT) return []

        const titleCell = cells[0]
        const difficultyCell = cells[1]
        if (titleCell === undefined || difficultyCell === undefined) return []

        const lamp = findLamp(row)
        if (lamp === null) return []

        const anchor = titleCell.querySelector('a.music_info') ?? titleCell.querySelector('a')
        const title = elementText(anchor)
        if (title === '') return []

        const difficultyName = matchDifficultyName(elementText(difficultyCell))
        if (difficultyName === null) return []

        const score = parseScore(elementText(cells[3] ?? null))

        return [
            {
                title,
                difficultyName,
                difficulty: DIFFICULTY_NAME_TO_CODE[difficultyName],
                level,
                style,
                djLevel: matchDjLevel(cells[2] ?? null),
                exScore: score.exScore,
                pgreat: score.pgreat,
                great: score.great,
                missCount: parseMissCount(row),
                lamp,
            } satisfies ParsedChart,
        ]
    })

    return { charts, isNoData, requiresLogin }
}

export const difficultyUrl = (level: number, style: 0 | 1, offset: number) =>
    `/game/2dx/34/djdata/music/difficulty.html?difficult=${level - 1}&style=${style}&disp=1&offset=${offset}`

export const resolveDifficultyCode = (difficultyName: DifficultyName): DifficultyCode => DIFFICULTY_NAME_TO_CODE[difficultyName]
