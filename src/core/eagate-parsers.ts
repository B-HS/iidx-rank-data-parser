import { NO_DATA_MARKER } from '@shared/constants'
import { DIFFICULTY_NAMES, DIFFICULTY_NAME_TO_CODE, DJ_LEVELS, LAMP_VALUES, RADAR_AXES } from '@shared/domain'
import type {
    DifficultyCode,
    DifficultyName,
    DifficultyPage,
    DjLevel,
    Lamp,
    LoginPage,
    NotesRadar,
    Pair,
    ParsedChart,
    Player,
    RadarAxis,
} from '@shared/schema'

export type { ParsedChart }

export type DifficultyPageResult = DifficultyPage

export type StatusPageResult = {
    player: Player
    notesRadar: NotesRadar
}

export type LoginPageResult = LoginPage

export type RadarSource = NotesRadar['source']

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
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
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

const pairFromDivCells = (entry: Element): Pair | null => {
    const cells = Array.from(entry.children).filter((child) => child.tagName === 'DIV')
    const first = cells[0]
    if (first === undefined) return null

    return {
        label: elementText(first),
        value: cells
            .slice(1)
            .map((cell) => elementText(cell))
            .filter((text) => text !== '')
            .join(' '),
    }
}

const pairsFromDivRows = (parent: ParentNode, selector: string) =>
    Array.from(parent.querySelectorAll(selector)).flatMap((entry) => {
        const pair = pairFromDivCells(entry)
        return pair === null ? [] : [pair]
    })

const radarFromPairs = (pairs: Pair[], allowsOrderFallback: boolean) => {
    const values = EMPTY_RADAR_VALUES()
    const labeledPairs = pairs.flatMap((pair) => {
        const axis = matchRadarAxis(pair.label)
        return axis === null ? [] : [{ axis, value: parseRadarValue(pair.value) }]
    })

    for (const { axis, value } of labeledPairs) {
        if (values[axis] === null) values[axis] = value
    }

    const matchedByLabel = labeledPairs.length > 0
    const isOrderedAxisList = pairs.length === RADAR_AXES.length && pairs.every((pair) => parseRadarValue(pair.value) !== null)

    if (!matchedByLabel && allowsOrderFallback && isOrderedAxisList) {
        RADAR_AXES.forEach((axis, index) => {
            values[axis] = parseRadarValue(pairs[index]?.value ?? '')
        })
    }

    return { values, matchedByLabel }
}

const RADAR_ROOT_SELECTORS = ['#notes', '#radar', '.dj-status']
const RADAR_ORDER_FALLBACK_SELECTOR = '#notes'

/**
 * Reads the six notes radar axes from a status or notes radar page.
 * Values are matched by axis label. Order based matching is only used when
 * the dedicated radar block holds exactly six numeric entries, and nothing is
 * inferred from unrelated page text.
 * @param doc - server rendered page
 * @param source - page the document came from
 */
export const parseRadarSection = (doc: Document, source: RadarSource): NotesRadar => {
    const root = RADAR_ROOT_SELECTORS.map((selector) => doc.querySelector(selector)).find((candidate) => candidate !== null) ?? null
    if (root === null) return { values: EMPTY_RADAR_VALUES(), raw: [], source, matchedByLabel: false }

    const pairs = sanitizePairs([
        ...pairsFromListItems(root, 'ul li'),
        ...pairsFromDefinitionList(root),
        ...pairsFromTable(root, 'table tr'),
        ...pairsFromDivRows(root, '.rank-cat'),
    ])
    const { values, matchedByLabel } = radarFromPairs(pairs, root.matches(RADAR_ORDER_FALLBACK_SELECTOR))

    return { values, raw: pairs, source, matchedByLabel }
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
    const { values, matchedByLabel } = radarFromPairs(sanitized, false)

    return { values, raw: sanitized, source, matchedByLabel }
}

const findPairValue = (pairs: Pair[], pattern: RegExp) => pairs.find((pair) => pattern.test(pair.label))?.value ?? null

const findFilledPairValue = (pairs: Pair[], pattern: RegExp) => {
    const value = findPairValue(pairs, pattern)
    return value !== null && !isPlaceholder(value) ? value : null
}

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
        for (const pair of pairsFromDivRows(section, '.rank-cat, .point-cat, .visit-cat')) {
            if (pair.label !== '') pairs.push({ label: sectionTitle === '' ? pair.label : `${sectionTitle} / ${pair.label}`, value: pair.value })
        }
    }

    return pairs
}

export const parseStatusPage = (doc: Document): StatusPageResult => {
    const pairs = parseStatusPairs(doc)
    const loginNames = parseLoginState(doc)
    const playCountValue = findPairValue(pairs, /プレー回数|プレイ回数|プレイ数/)
    const totalPlayCount = playCountValue === null ? null : matchIntegerAfter(playCountValue, /(?:合計|トータル|TOTAL)\s*[:：]?\s*([\d,]+)/i)
    const playCountSp = matchIntegerAfter(playCountValue, /SP\s*[:：]?\s*([\d,]+)/i)
    const playCountDp = matchIntegerAfter(playCountValue, /DP\s*[:：]?\s*([\d,]+)/i)
    const isSinglePlayCount = playCountSp === null && playCountDp === null

    const player: Player = {
        communityNickname: loginNames.communityNickname,
        djName: loginNames.djName ?? findFilledPairValue(pairs, /DJ\s*NAME/i),
        iidxId: findFilledPairValue(pairs, /IIDX\s*ID/i),
        danRank: findFilledPairValue(pairs, /段位/),
        djPoint: firstNumber(findPairValue(pairs, /DJ\s*POINT/i)),
        playCountSp,
        playCountDp,
        playCountTotal: totalPlayCount ?? (isSinglePlayCount ? firstInteger(playCountValue) : null),
        profile: pairs,
    }

    return { player, notesRadar: parseRadarSection(doc, 'status') }
}

const matchDifficultyName = (value: string): DifficultyName | null => {
    const normalized = normalizeText(value).toUpperCase()

    return DIFFICULTY_NAMES.find((name) => name === normalized) ?? null
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

        const lamp = LAMP_VALUES.at(Number.parseInt(match[1], 10))
        if (lamp !== undefined) return lamp
    }

    return null
}

const parseGroupedInteger = (value: string | undefined) => (value === undefined ? null : Number.parseInt(value.replace(/,/g, ''), 10))

const parseScore = (value: string) => {
    const normalized = normalizeText(value)
    const detailed = normalized.match(/^(\d[\d,]*)\s*\(\s*(\d[\d,]*)\s*\/\s*(\d[\d,]*)\s*\)/)
    if (detailed !== null) {
        return {
            exScore: parseGroupedInteger(detailed[1]),
            pgreat: parseGroupedInteger(detailed[2]),
            great: parseGroupedInteger(detailed[3]),
        }
    }

    const single = normalized.match(/^(\d[\d,]*)/)
    return {
        exScore: parseGroupedInteger(single?.[1]),
        pgreat: null,
        great: null,
    }
}

type DifficultyRowResult = { kind: 'structural' } | { kind: 'skipped' } | { kind: 'chart'; chart: ParsedChart }

const parseDifficultyRow = (row: Element, level: number, style: 0 | 1): DifficultyRowResult => {
    const cells = Array.from(row.querySelectorAll('td'))
    const titleCell = cells[0]
    const difficultyCell = cells[1]
    if (cells.length < DIFFICULTY_COLUMN_COUNT || titleCell === undefined || difficultyCell === undefined) return { kind: 'structural' }

    const lamp = findLamp(row)
    const anchor = titleCell.querySelector('a.music_info') ?? titleCell.querySelector('a')
    if (lamp === null && anchor === null) return { kind: 'structural' }

    const anchorTitle = elementText(anchor)
    const title = anchorTitle !== '' ? anchorTitle : elementText(titleCell)
    const difficultyName = matchDifficultyName(elementText(difficultyCell))
    if (lamp === null || title === '' || difficultyName === null) return { kind: 'skipped' }

    const score = parseScore(elementText(cells[3] ?? null))

    return {
        kind: 'chart',
        chart: {
            title,
            difficultyName,
            difficulty: DIFFICULTY_NAME_TO_CODE[difficultyName],
            level,
            style,
            djLevel: matchDjLevel(cells[2] ?? null),
            exScore: score.exScore,
            pgreat: score.pgreat,
            great: score.great,
            missCount: null,
            lamp,
        },
    }
}

/**
 * Parses one page of the level based chart list.
 * The page only has five columns, so the miss count is never available here.
 * `rowCount` counts every song row, including rows that could not be parsed,
 * so pagination does not end early when a row is skipped.
 * @param doc - server rendered difficulty page
 * @param level - game level requested for this page
 * @param style - 0 for SP, 1 for DP
 */
export const parseDifficultyPage = (doc: Document, level: number, style: 0 | 1): DifficultyPageResult => {
    const table = doc.querySelector('div.series-difficulty table')
    const requiresLogin = isLoginRequiredPage(doc)
    const notice = elementText(doc.querySelector('.music-notice, #base .music-notice'))
    const isNoData = table == null && notice.includes(NO_DATA_MARKER)

    if (table == null) return { charts: [], rowCount: 0, skippedRowCount: 0, hasTable: false, isNoData, requiresLogin }

    const rows = Array.from(table.querySelectorAll('tr'))
        .map((row) => parseDifficultyRow(row, level, style))
        .filter((row) => row.kind !== 'structural')
    const charts = rows.flatMap((row) => (row.kind === 'chart' ? [row.chart] : []))

    return { charts, rowCount: rows.length, skippedRowCount: rows.length - charts.length, hasTable: true, isNoData, requiresLogin }
}

export const difficultyUrl = (level: number, style: 0 | 1, offset: number) =>
    `/game/2dx/34/djdata/music/difficulty.html?difficult=${level - 1}&style=${style}&disp=1&offset=${offset}`

export const resolveDifficultyCode = (difficultyName: DifficultyName): DifficultyCode => DIFFICULTY_NAME_TO_CODE[difficultyName]
