import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MaterialsController } from './materials.controller';
import { MaterialsService } from './materials.service';
import { Material, MaterialSchema } from '../schemas/material.schema';
import { Chunk, ChunkSchema } from '../schemas/chunk.schema';
import { LlmModule } from '../llm/llm.module';
import { QuestionsModule } from '../questions/questions.module'; // To access EmbeddingService? 
// Actually, EmbeddingService is in QuestionsModule but maybe not exported. 
// It's better to move EmbeddingService to LlmModule or SharedModule, OR just import QuestionsModule if it exports it.
// For now, I'll assume I can import QuestionsModule. If not, I'll refactor.

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Material.name, schema: MaterialSchema },
            { name: Chunk.name, schema: ChunkSchema },
        ]),
        LlmModule.forRoot(),
        forwardRef(() => QuestionsModule),
    ],
    controllers: [MaterialsController],
    providers: [MaterialsService],
    exports: [MaterialsService],
})
export class MaterialsModule { }
