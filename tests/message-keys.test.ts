import { describe, expect, test } from 'bun:test'
import { FLOW_FAILURES, LEVEL_FAILURES, RUN_ABORT_FAILURES } from '@shared/domain'
import { MANIFEST_MESSAGE_KEYS, MESSAGE_KEYS, MESSAGE_KEY_PATTERN, MESSAGE_PARAMS, MESSAGE_PARAM_LIMIT, toMessage } from '@shared/message-keys'
import { RANK_SYNC_REASONS } from '@shared/rank-schema'
import { createFlowError, flowFailureOf, messageOfError } from '@core/flow-error'

const keys: readonly string[] = MESSAGE_KEYS

describe('MESSAGE_KEYS', () => {
    test('키는 영문자, 숫자, 밑줄만 쓰고 중복되지 않는다', () => {
        expect([...MESSAGE_KEYS, ...MANIFEST_MESSAGE_KEYS].every((key) => MESSAGE_KEY_PATTERN.test(key))).toBe(true)
        expect(new Set(MESSAGE_KEYS).size).toBe(MESSAGE_KEYS.length)
    })

    test('모든 키에 파라미터 이름이 정의되어 있고 chrome.i18n 한도를 넘지 않는다', () => {
        expect(Object.keys(MESSAGE_PARAMS).toSorted()).toEqual(keys.toSorted())
        expect(Object.values(MESSAGE_PARAMS).every((names) => names.length <= MESSAGE_PARAM_LIMIT)).toBe(true)
    })

    test('실패 코드와 반영 사유 코드마다 메시지 키가 있다', () => {
        expect(FLOW_FAILURES.every((failure) => keys.includes(`error_${failure}`))).toBe(true)
        expect(LEVEL_FAILURES.every((failure) => keys.includes(`warning_page_${failure}`))).toBe(true)
        expect(RUN_ABORT_FAILURES.every((failure) => keys.includes(`warning_aborted_${failure}`))).toBe(true)
        expect(RANK_SYNC_REASONS.every((reason) => keys.includes(`rank_reason_${reason}`))).toBe(true)
    })
})

describe('toMessage', () => {
    test('파라미터를 선언된 순서의 문자열 배열로 만든다', () => {
        expect(toMessage('progress_charts', { offset: 50, page: 2, level: 12 })).toEqual({ key: 'progress_charts', params: ['12', '2', '50'] })
    })

    test('파라미터가 없는 키는 빈 배열을 가진다', () => {
        expect(toMessage('progress_starting')).toEqual({ key: 'progress_starting', params: [] })
    })
})

describe('messageOfError', () => {
    test('흐름 오류는 실패 코드의 메시지 키로 바꾼다', () => {
        const error = createFlowError('session_expired')

        expect(flowFailureOf(error)).toBe('session_expired')
        expect(messageOfError(error)).toEqual({ key: 'error_session_expired', params: [] })
    })

    test('알 수 없는 오류는 원문을 노출하지 않고 공통 키로 바꾼다', () => {
        expect(flowFailureOf(new Error('boom'))).toBeNull()
        expect(messageOfError(new Error('boom'))).toEqual({ key: 'error_unknown', params: [] })
        expect(messageOfError('boom')).toEqual({ key: 'error_unknown', params: [] })
    })
})
