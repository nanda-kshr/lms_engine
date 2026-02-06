import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, AnyBulkWriteOperation } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { Question, QuestionDocument } from '../../schemas/question.schema';

const EMBEDDING_MODEL = 'text-embedding-004';
const BATCH_SIZE = 10;

@Injectable()
export class EmbeddingService {
    private readonly logger = new Logger(EmbeddingService.name);
    private client: GoogleGenAI;

    constructor(
        @InjectModel(Question.name)
        private readonly questionModel: Model<QuestionDocument>,
        private readonly configService: ConfigService,
    ) {
        const apiKey = this.configService.get<string>('GEMINI_API_KEY');
        if (apiKey) {
            this.client = new GoogleGenAI({ apiKey });
            this.logger.log('Embedding service initialized with Gemini API key');
        } else {
            this.logger.error('GEMINI_API_KEY not set - embeddings will NOT be generated');
        }
    }

    async generateEmbeddings(questionIds: string[]): Promise<void> {
        this.logger.log(`Starting embedding generation for ${questionIds.length} questions`);

        if (!this.client) {
            this.logger.error('Embedding client not initialized - GEMINI_API_KEY missing?');
            return;
        }

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
        if (!this.client) {
            this.logger.warn('Embedding client not initialized');
            return null;
        }

        try {
            const response = await this.client.models.embedContent({
                model: EMBEDDING_MODEL,
                contents: [{ parts: [{ text }] }],
            });

            return response.embeddings?.[0]?.values ?? null;
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
                    const response = await this.client.models.embedContent({
                        model: EMBEDDING_MODEL,
                        contents: [{ parts: [{ text: question.question_text }] }],
                    });

                    if (response.embeddings?.[0]?.values) {
                        bulkOps.push({
                            updateOne: {
                                filter: { _id: question._id },
                                update: {
                                    $set: {
                                        embedding: response.embeddings[0].values,
                                        embedding_model: EMBEDDING_MODEL,
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
