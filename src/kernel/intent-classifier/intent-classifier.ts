import { splitRawCommands } from '@/nlp/language-profile/profiles/profile-en-us'

/**
 * @class IntentClassifier
 *
 * Responsible for coordinating the transformation of a raw player input into
 * a list of actionable Intents that the engine knows how to handle
 */
export class IntentClassifier {

    getIntentsFromCommand(command: string) {
        const splitCommands = splitRawCommands(command)
    }
}
