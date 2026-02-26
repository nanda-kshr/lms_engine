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
            model: "gemini-2.5-flash-lite",
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

    async embed(text: string): Promise<number[]> {
        const result = await this.client.models.embedContent({
            model: 'models/gemini-embedding-001',
            contents: [{ parts: [{ text }] }],
        });
        return result.embeddings?.[0]?.values ?? [];
    }

    async repairJson(brokenJson: string): Promise<any> {
        try {
            const response = await this.client.models.generateContent({
                model: "gemini-2.5-flash-lite",
                contents: [
                    {
                        role: 'user',
                        parts: [
                            {
                                text: `Fix this broken JSON and return ONLY the valid JSON data structure. No explanations.\n\n${brokenJson}`,
                            },
                        ],
                    },
                ],
                config: {
                    temperature: 0.1,
                    responseMimeType: "application/json",
                },
            });

            let fixed = (response.text ?? '').trim();
            if (fixed.startsWith('```')) {
                fixed = fixed.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
            }
            return JSON.parse(fixed);
        } catch (e) {
            console.error(`JSON Repair failed in GeminiAdapter: ${e.message}`);
            return null;
        }
    }
}
