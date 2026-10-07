import { isLoginRequiredPage, parseDifficultyPage, parseLoginState, parseRadarSection, parseStatusPage } from '@core/eagate-parsers'
import { ExtractEnvelopeSchema, ExtractRequestSchema } from '@shared/messages'
import type { ExtractRequest, ExtractResponse } from '@shared/messages'

const buildResponse = (request: ExtractRequest): ExtractResponse => {
    const url = window.location.href

    if (request.kind === 'LOGIN') return { ok: true, kind: 'LOGIN', url, login: parseLoginState(document) }

    if (request.kind === 'STATUS') {
        const { player, notesRadar } = parseStatusPage(document)
        return { ok: true, kind: 'STATUS', url, requiresLogin: isLoginRequiredPage(document), player, notesRadar }
    }

    if (request.kind === 'RADAR') return { ok: true, kind: 'RADAR', url, notesRadar: parseRadarSection(document, 'notesradar') }

    return { ok: true, kind: 'DIFFICULTY', url, difficulty: parseDifficultyPage(document, request.level, request.style) }
}

const respond = (message: unknown): ExtractResponse => {
    const request = ExtractRequestSchema.safeParse(message)
    if (!request.success) return { ok: false, kind: 'ERROR', reason: 'invalid_request' }

    try {
        return buildResponse(request.data)
    } catch {
        return { ok: false, kind: 'ERROR', reason: 'parse_error' }
    }
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if (!ExtractEnvelopeSchema.safeParse(message).success) return false

    sendResponse(respond(message))
    return false
})
