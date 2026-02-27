import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
    LlmProvider,
    LlmCompletionOptions,
    LlmCompletionResponse,
} from '../llm.interface';

@Injectable()
export class OllamaAdapter implements LlmProvider {
    private readonly logger = new Logger(OllamaAdapter.name);
    private readonly baseUrl: string;
    private readonly model: string;

    constructor(private readonly configService: ConfigService) {
        this.baseUrl = this.configService.get<string>('OLLAMA_BASE_URL') || 'http://localhost:11434';
        this.model = this.configService.get<string>('OLLAMA_MODEL') || 'llama3';
    }

    async complete(options: LlmCompletionOptions): Promise<LlmCompletionResponse> {
        const systemMessage = options.messages.find((m) => m.role === 'system');
        const userMessage = options.messages.find((m) => m.role === 'user');

        const prompt = systemMessage
            ? `${systemMessage.content}\n\nUser: ${userMessage?.content}`
            : userMessage?.content || '';

        const startTime = Date.now();
        try {
            const response = await fetch(`${this.baseUrl}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: this.model,
                    prompt: prompt,
                    stream: false,
                    options: {
                        num_predict: options.maxTokens,
                        temperature: options.temperature,
                    },
                }),
            });

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Ollama error: ${error}`);
            }

            const data = await response.json();
            const durationMs = Date.now() - startTime;
            const evalSpeed = data.eval_count && data.eval_duration ? (data.eval_count / (data.eval_duration / 1e9)).toFixed(2) : 'N/A';

            this.logger.log(
                `[Ollama Benchmark - Generate] Model: ${this.model} | Time: ${durationMs}ms | Prompt Tokens: ${data.prompt_eval_count ?? 0} | Completion Tokens: ${data.eval_count ?? 0} | Speed: ${evalSpeed} t/s`
            );

            let content = (data.response ?? '').trim();

            // Strip R1 thinking tags if present
            content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

            return {
                content,
                usage: {
                    promptTokens: data.prompt_eval_count ?? 0,
                    completionTokens: data.eval_count ?? 0,
                },
            };
        } catch (error) {
            this.logger.error(`Ollama completion failed: ${error.message}`);
            throw error;
        }
    }

    async embed(text: string): Promise<number[]> {
        const startTime = Date.now();
        try {
            const response = await fetch(`${this.baseUrl}/api/embeddings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: this.model,
                    prompt: text,
                }),
            });

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Ollama embedding error: ${error}`);
            }

            const data = await response.json();
            const durationMs = Date.now() - startTime;
            this.logger.log(`[Ollama Benchmark - Embed] Model: ${this.model} | Time: ${durationMs}ms | Text Length: ${text.length} chars`);

            return data.embedding ?? [];
        } catch (error) {
            this.logger.error(`Ollama embedding failed: ${error.message}`);
            throw error;
        }
    }

    async repairJson(brokenJson: string): Promise<any> {
        const startTime = Date.now();
        this.logger.log(`Attempting to repair broken JSON string (length: ${brokenJson.length})`);
        try {
            const response = await fetch(`${this.baseUrl}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: this.model,
                    prompt: `Fix this broken JSON and return ONLY the valid JSON data structure. No explanations.\n\n${brokenJson}`,
                    stream: false,
                    format: 'json', // Force JSON output mode for repair
                    options: {
                        temperature: 0.1, // Low temp for strictly fixing formatting
                    },
                }),
            });

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Ollama repair error: ${error}`);
            }

            const data = await response.json();
            const durationMs = Date.now() - startTime;

            this.logger.log(`[Ollama Benchmark - Repair] Time: ${durationMs}ms`);

            let fixed = (data.response ?? '').trim();
            if (fixed.startsWith('```')) {
                fixed = fixed.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
            }
            return JSON.parse(fixed);
        } catch (e) {
            this.logger.error(`JSON Repair failed in OllamaAdapter: ${e.message}`);
            return null;
        }
    }
}
