import { parseDifficultyPage, parseLoginState, parseRadarSection, parseStatusPage } from '@core/eagate-parsers'
import type { ExtractRequest, ExtractResponse } from '@shared/messages'

const buildResponse = (request: ExtractRequest): ExtractResponse => {
    const url = window.location.href
    const login = parseLoginState(document)

    if (request.kind === 'LOGIN') {
        return {
            ok: true,
            payload: {
                url,
                login: { isLoggedIn: login.isLoggedIn, communityNickname: login.communityNickname, djName: login.djName },
                status: null,
                radar: null,
                difficulty: null,
            },
        }
    }

    if (request.kind === 'STATUS') {
        const { player, notesRadar } = parseStatusPage(document)
        return { ok: true, payload: { url, login: null, status: { player, notesRadar }, radar: notesRadar, difficulty: null } }
    }

    if (request.kind === 'RADAR') {
        const radar = parseRadarSection(document, 'notesradar')
        return { ok: true, payload: { url, login: null, status: null, radar, difficulty: null } }
    }

    if (request.level === undefined || request.style === undefined) {
        return { ok: false, error: 'difficulty 추출에는 level과 style이 필요합니다.' }
    }

    const difficulty = parseDifficultyPage(document, request.level, request.style)
    return { ok: true, payload: { url, login: null, status: null, radar: null, difficulty } }
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if (typeof message !== 'object' || message === null || (message as { type?: unknown }).type !== 'EXTRACT') return false

    try {
        sendResponse(buildResponse(message as ExtractRequest))
    } catch (error) {
        sendResponse({ ok: false, error: error instanceof Error ? error.message : '알 수 없는 추출 오류' })
    }

    return false
})
