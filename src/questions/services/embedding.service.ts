import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, AnyBulkWriteOperation } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { LlmService } from '../../llm/llm.service';
import { Question, QuestionDocument } from '../../schemas/question.schema';

const BATCH_SIZE = 10;

@Injectable()
export class EmbeddingService {
    private readonly logger = new Logger(EmbeddingService.name);

    constructor(
        @InjectModel(Question.name)
        private readonly questionModel: Model<QuestionDocument>,
        private readonly configService: ConfigService,
        private readonly llmService: LlmService,
    ) { }

    async generateEmbeddings(questionIds: string[]): Promise<void> {
        this.logger.log(`Starting embedding generation for ${questionIds.length} questions`);

        for (let i = 0; i < questionIds.length; i += BATCH_SIZE) {
            const batchIds = questionIds.slice(i, i + BATCH_SIZE);
            await this.processBatch(batchIds);
        }

        this.logger.log('Embedding generation complete');
    }

    /**
     * Generate embedding synchronously for a single text (used for duplicate detection)
     */
    async generateEmbeddingSync(text: string): Promise<number[] | null> {
        try {
            return await this.llmService.embed(text);
        } catch (error) {
            this.logger.warn(`Embedding generation failed: ${error.message}`);
            return null;
        }
    }

    private async processBatch(questionIds: string[]): Promise<void> {
        try {
            const questions = await this.questionModel
                .find({
                    _id: { $in: questionIds },
                    $or: [
                        { embedding: { $exists: false } },
                        { embedding: { $size: 0 } },
                    ],
                })
                .select('_id question_text')
                .lean();

            this.logger.log(`Found ${questions.length} questions needing embeddings`);

            if (questions.length === 0) return;

            const bulkOps: AnyBulkWriteOperation<QuestionDocument>[] = [];

            for (const question of questions) {
                try {
                    const embedding = await this.llmService.embed(question.question_text);

                    if (embedding && embedding.length > 0) {
                        bulkOps.push({
                            updateOne: {
                                filter: { _id: question._id },
                                update: {
                                    $set: {
                                        embedding: embedding,
                                        embedding_model: 'provider-default', // We rely on the configured provider
                                    },
                                },
                            },
                        });
                    }
                } catch (error) {
                    this.logger.warn(
                        `Embedding failed for question ${question._id}: ${error.message}`,
                    );
                }
            }

            if (bulkOps.length > 0) {
                await this.questionModel.bulkWrite(bulkOps);
                this.logger.log(`Generated embeddings for ${bulkOps.length} questions`);
            }
        } catch (error) {
            this.logger.error(`Batch embedding failed: ${error.message}`);
        }
    }
}
