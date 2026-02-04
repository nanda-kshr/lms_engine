import { Inject, Injectable } from '@nestjs/common';
import {
    LLM_PROVIDER,
    type LlmProvider,
    type LlmCompletionOptions,
    type LlmCompletionResponse,
} from './llm.interface';

@Injectable()
export class LlmService {
    constructor(
        @Inject(LLM_PROVIDER) private readonly provider: LlmProvider,
    ) { }

    async complete(options: LlmCompletionOptions): Promise<LlmCompletionResponse> {
        return this.provider.complete(options);
    }
}
