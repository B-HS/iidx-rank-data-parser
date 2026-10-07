import { z } from 'zod'
import { FLOW_FAILURES } from '@shared/domain'
import type { FlowFailure } from '@shared/domain'
import { toMessage } from '@shared/message-keys'

const FlowFailureSchema = z.enum(FLOW_FAILURES)

/**
 * Creates an error that carries a machine readable failure code.
 * @param failure - failure code from FLOW_FAILURES
 */
export const createFlowError = (failure: FlowFailure) => Object.assign(new Error(failure), { flowFailure: failure })

/**
 * Reads the failure code from an unknown thrown value.
 * @param error - value caught from a collection step
 */
export const flowFailureOf = (error: unknown) => {
    if (!(error instanceof Error) || !('flowFailure' in error)) return null

    const parsed = FlowFailureSchema.safeParse(error.flowFailure)
    return parsed.success ? parsed.data : null
}

/**
 * Converts an unknown thrown value to a storable message reference.
 * @param error - value caught from a collection step or message handler
 */
export const messageOfError = (error: unknown) => {
    const failure = flowFailureOf(error)
    return failure === null ? toMessage('error_unknown') : toMessage(`error_${failure}`)
}
