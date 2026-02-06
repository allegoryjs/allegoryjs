export const defaultEmitStreams = Object.freeze({
    narrate: 'narrate',
    engineError: 'engine-error',
})

export const engineErrorCodes = Object.freeze({
    unknownMutationAlias: 'unknown-mutation-alias'
})

export interface EngineEvent {
    type: string
    payload?: unknown
}

export default class Emitter {
    emit(eventName: string, payload?: unknown): Promise<void> {
        console.info('event emitted')
        console.log(eventName)
        console.dir(payload)

        return Promise.resolve();
    }
}
