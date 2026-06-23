import type { IntentClassificationResponse } from '@/kernel/intent-pipeline/intent-pipeline.types';

export interface IntentClassificationModule {
    getIntentsFromCommand: (command: string) => Promise<Array<IntentClassificationResponse>>
}
