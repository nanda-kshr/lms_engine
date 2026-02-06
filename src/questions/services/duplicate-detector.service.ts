import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { Question, QuestionDocument } from '../../schemas/question.schema';
import { EmbeddingService } from './embedding.service';
import type { NormalizedQuestion } from './normalizer.service';

export interface DuplicateCheckResult {
    question: NormalizedQuestion;
    duplicate_warning: boolean;
    similar_question_id?: Types.ObjectId;
    similarity_score?: number;
}

@Injectable()
export class DuplicateDetectorService {
    private readonly logger = new Logger(DuplicateDetectorService.name);
    private readonly strongThreshold: number;
    private readonly weakThreshold: number;

    constructor(
        @InjectModel(Question.name)
        private readonly questionModel: Model<QuestionDocument>,
        private readonly embeddingService: EmbeddingService,
        private readonly configService: ConfigService,
    ) {
        this.strongThreshold = parseFloat(
            this.configService.get<string>('SIMILARITY_THRESHOLD_STRONG', '0.90'),
        );
        this.weakThreshold = parseFloat(
            this.configService.get<string>('SIMILARITY_THRESHOLD_WEAK', '0.80'),
        );
    }

    async checkDuplicates(
        questions: NormalizedQuestion[],
    ): Promise<DuplicateCheckResult[]> {
        // Get existing questions with embeddings
        const existingQuestions = await this.questionModel
            .find({ embedding: { $exists: true, $ne: [] } })
            .select('_id question_text embedding')
            .lean();

        const results: DuplicateCheckResult[] = [];

        for (const question of questions) {
            const result = await this.checkSingleQuestion(question, existingQuestions);
            results.push(result);
        }

        return results;
    }

    private async checkSingleQuestion(
        question: NormalizedQuestion,
        existingQuestions: Array<{ _id: unknown; question_text: string; embedding?: number[] }>,
    ): Promise<DuplicateCheckResult> {
        // Generate embedding for new question
        const embedding = await this.embeddingService.generateEmbeddingSync(
            question.question_text,
        );

        if (!embedding || existingQuestions.length === 0) {
            return {
                question,
                duplicate_warning: false,
            };
        }

        // Find most similar existing question
        let maxSimilarity = 0;
        let mostSimilarId: Types.ObjectId | undefined;

        for (const existing of existingQuestions) {
            if (!existing.embedding || existing.embedding.length === 0) continue;

            const similarity = this.cosineSimilarity(embedding, existing.embedding);

            if (similarity > maxSimilarity) {
                maxSimilarity = similarity;
                mostSimilarId = existing._id as Types.ObjectId;
            }
        }

        // Determine if this is a duplicate warning
        // >= 0.90: strong signal (warn)
        // 0.80-0.89: weak signal (store score, no action)
        // < 0.80: ignore
        const isDuplicateWarning = maxSimilarity >= this.strongThreshold;
        const shouldStoreScore = maxSimilarity >= this.weakThreshold;

        return {
            question: {
                ...question,
                duplicate_warning: isDuplicateWarning,
                similar_question_id: shouldStoreScore ? mostSimilarId : undefined,
                similarity_score: shouldStoreScore ? maxSimilarity : undefined,
            },
            duplicate_warning: isDuplicateWarning,
            similar_question_id: shouldStoreScore ? mostSimilarId : undefined,
            similarity_score: shouldStoreScore ? maxSimilarity : undefined,
        };
    }

    private cosineSimilarity(a: number[], b: number[]): number {
        if (a.length !== b.length) return 0;

        let dot = 0;
        let magA = 0;
        let magB = 0;

        for (let i = 0; i < a.length; i++) {
            dot += a[i] * b[i];
            magA += a[i] * a[i];
            magB += b[i] * b[i];
        }

        const magnitude = Math.sqrt(magA) * Math.sqrt(magB);
        const similarity = magnitude === 0 ? 0 : dot / magnitude;
        // Clamp to [0, 1] to handle floating point precision
        return Math.min(1, Math.max(0, similarity));
    }
}
