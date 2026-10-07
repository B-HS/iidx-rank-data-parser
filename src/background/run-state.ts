export type ActiveRun = {
    runId: string
    controller: AbortController
    isCancelled: boolean
}

export const runState: { active: ActiveRun | null; isSyncing: boolean } = { active: null, isSyncing: false }

export const createRun = (): ActiveRun => ({ runId: crypto.randomUUID(), controller: new AbortController(), isCancelled: false })

export const releaseRun = (run: ActiveRun) => {
    if (runState.active === run) runState.active = null
}
