import type { Entity } from './ecs'

const config = {

}


interface Intent {
    name: string
    actor: Entity
    target: Entity
}

declare const mlModule: {
    convertCommandToIntents: (command: string) => Promise<Array<Intent>>
}

class Emitter {
    emit(eventName: string, payload: unknown): Promise<void> {
        console.info('event emitted')
        console.log(eventName)
        console.dir(payload)

        return Promise.resolve();
    }
}

declare const emitter: Emitter

export default class IntentPipeline extends Emitter {

    async handleCommand(playerCommand: string) {
        const intents = await mlModule.convertCommandToIntents(playerCommand)

        if (!intents.length) {
            await super.emit('narrate', [
                "Sorry, I don't understand.",
                `You can type "help" if you're not sure what to do.`
            ])

            return
        }

        let i = 0

        while (i < intents.length) {
            await this.#auction(intents[i])
            i++
        }
    }

    #auction (intent: Intent): Promise<void> {
        return Promise.resolve();
    }
}
