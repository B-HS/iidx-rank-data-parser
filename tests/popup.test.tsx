import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { Popup } from '@widgets/popup'

const chromeStub = {
    runtime: { sendMessage: async () => ({ ok: true, data: null }) },
    storage: {
        local: { get: async () => ({}), set: async () => undefined, remove: async () => undefined },
        session: { get: async () => ({}), set: async () => undefined, remove: async () => undefined },
        onChanged: { addListener: () => undefined, removeListener: () => undefined },
    },
}

Object.assign(globalThis, { chrome: chromeStub })

describe('Popup', () => {
    test('초기 상태를 렌더한다', () => {
        const html = renderToStaticMarkup(<Popup />)

        expect(html).toContain('IIDX Data Parser')
        expect(html).toContain('데이터 수집 시작')
        expect(html).toContain('비로그인')
        expect(html).toContain('저장된 데이터가 없습니다')
        expect(html).toContain('disabled')
    })
})
