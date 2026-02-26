import { Module, DynamicModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LlmService } from './llm.service';
import { LLM_PROVIDER } from './llm.interface';
import { GeminiAdapter } from './adapters/gemini.adapter';
import { OllamaAdapter } from './adapters/ollama.adapter';

@Module({})
export class LlmModule {
    static forRoot(): DynamicModule {
        return {
            module: LlmModule,
            imports: [ConfigModule],
            providers: [
                LlmService,
                {
                    provide: LLM_PROVIDER,
                    useFactory: (configService: ConfigService) => {
                        const type = configService.get<string>('LLM_PROVIDER_TYPE') || 'gemini';
                        return type === 'ollama'
                            ? new OllamaAdapter(configService)
                            : new GeminiAdapter(configService);
                    },
                    inject: [ConfigService],
                },
            ],
            exports: [LlmService],
        };
    }
}
