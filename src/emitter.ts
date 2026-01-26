export const defaultEmitStreams = Object.freeze({
    narrate: 'narrate'
})

export default class Emitter {
    emit(eventName: string, payload: unknown): Promise<void> {
        console.info('event emitted')
        console.log(eventName)
        console.dir(payload)

        return Promise.resolve();
    }
}
