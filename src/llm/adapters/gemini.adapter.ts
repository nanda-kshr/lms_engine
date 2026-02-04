import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import type {
    LlmProvider,
    LlmCompletionOptions,
    LlmCompletionResponse,
} from '../llm.interface';

@Injectable()
export class GeminiAdapter implements LlmProvider {
    private client: GoogleGenAI;
    private model = 'gemini-2.0-flash';

    constructor(private readonly configService: ConfigService) {
        const apiKey = this.configService.get<string>('GEMINI_API_KEY');
        if (!apiKey) {
            throw new Error('GEMINI_API_KEY is not configured');
        }
        this.client = new GoogleGenAI({ apiKey });
    }

    async complete(options: LlmCompletionOptions): Promise<LlmCompletionResponse> {
        const systemMessage = options.messages.find((m) => m.role === 'system');
        const conversationMessages = options.messages.filter(
            (m) => m.role !== 'system',
        );

        const contents = conversationMessages.map((m) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
        }));

        const response = await this.client.models.generateContent({
            model: this.model,
            contents,
            config: {
                systemInstruction: systemMessage?.content,
                maxOutputTokens: options.maxTokens,
                temperature: options.temperature,
            },
        });

        return {
            content: response.text ?? '',
            usage: response.usageMetadata
                ? {
                    promptTokens: response.usageMetadata.promptTokenCount ?? 0,
                    completionTokens: response.usageMetadata.candidatesTokenCount ?? 0,
                }
                : undefined,
        };
    }
}
