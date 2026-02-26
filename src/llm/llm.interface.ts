export interface LlmMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface LlmCompletionOptions {
    messages: LlmMessage[];
    maxTokens?: number;
    temperature?: number;
}

export interface LlmCompletionResponse {
    content: string;
    usage?: {
        promptTokens: number;
        completionTokens: number;
    };
}

export interface LlmProvider {
    complete(options: LlmCompletionOptions): Promise<LlmCompletionResponse>;
    embed(text: string): Promise<number[]>;
    repairJson(brokenJson: string): Promise<any>;
}

export const LLM_PROVIDER = Symbol('LLM_PROVIDER');
