import { Module, DynamicModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LlmService } from './llm.service';
import { LLM_PROVIDER } from './llm.interface';
import { GeminiAdapter } from './adapters/gemini.adapter';

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
                    useClass: GeminiAdapter,
                },
            ],
            exports: [LlmService],
        };
    }
}
