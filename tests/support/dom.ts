import { act } from 'react'
import type { ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { JSDOM } from 'jsdom'

const DOM_GLOBAL_KEYS = ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'MouseEvent'] as const
const SETTLE_DELAY_MS = 0
const SETTLE_ROUNDS = 5

type DomEnvironment = { restore: () => void; container: HTMLElement; root: Root }

/**
 * Installs a jsdom window as globals and mounts React into it.
 * restore() puts every replaced global back so other test files are unaffected.
 */
export const installDom = (): DomEnvironment => {
    const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'chrome-extension://test/popup/index.html' })
    const globals = globalThis as Record<string, unknown>
    const previous = new Map<string, unknown>(DOM_GLOBAL_KEYS.map((key) => [key, globals[key]]))
    const previousActFlag = globals.IS_REACT_ACT_ENVIRONMENT

    const replacements: Record<(typeof DOM_GLOBAL_KEYS)[number], unknown> = {
        window: dom.window,
        document: dom.window.document,
        navigator: dom.window.navigator,
        HTMLElement: dom.window.HTMLElement,
        Node: dom.window.Node,
        MouseEvent: dom.window.MouseEvent,
    }

    Object.assign(globals, replacements, { IS_REACT_ACT_ENVIRONMENT: true })

    const container = dom.window.document.getElementById('root')
    if (container === null) throw new Error('root container missing')

    return {
        container,
        root: createRoot(container),
        restore: () => {
            for (const [key, value] of previous) {
                if (value === undefined) Reflect.deleteProperty(globals, key)
                else globals[key] = value
            }

            globals.IS_REACT_ACT_ENVIRONMENT = previousActFlag
            dom.window.close()
        },
    }
}

export const render = async (root: Root, element: ReactElement) => {
    await act(async () => {
        root.render(element)
    })
    await settle()
}

export const settle = async () => {
    for (let round = 0; round < SETTLE_ROUNDS; round += 1) {
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, SETTLE_DELAY_MS))
        })
    }
}

export const click = async (element: Element) => {
    await act(async () => {
        element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    await settle()
}

export const findButton = (container: HTMLElement, text: string) => {
    const button = [...container.querySelectorAll('button')].find((candidate) => candidate.textContent?.includes(text))
    if (button === undefined) throw new Error(`button not found: ${text}`)

    return button
}
