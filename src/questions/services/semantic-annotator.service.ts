import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Question, QuestionDocument } from '../../schemas/question.schema';
import { LlmService } from '../../llm';

interface SemanticResult {
    concepts: string[];
    abstraction_level: number;
    reasoning_steps: number;
}

interface BatchAnnotationResult {
    question_id: string;
    annotation: SemanticResult;
}

@Injectable()
export class SemanticAnnotatorService {
    private readonly logger = new Logger(SemanticAnnotatorService.name);
    private readonly BATCH_SIZE = 5;

    constructor(
        @InjectModel(Question.name)
        private readonly questionModel: Model<QuestionDocument>,
        private readonly llmService: LlmService,
    ) { }

    async annotateQuestions(questionIds: string[]): Promise<void> {
        // Process in batches
        for (let i = 0; i < questionIds.length; i += this.BATCH_SIZE) {
            const batchIds = questionIds.slice(i, i + this.BATCH_SIZE);
            await this.annotateBatch(batchIds);
        }
    }

    private async annotateBatch(questionIds: string[]): Promise<void> {
        try {
            const questions = await this.questionModel
                .find({ _id: { $in: questionIds } })
                .select('_id question_text')
                .lean();

            if (questions.length === 0) return;

            const prompt = this.buildPrompt(questions);
            const response = await this.llmService.complete({
                messages: [
                    {
                        role: 'system',
                        content: `You are a question analyzer. For each question, extract semantic metadata.
Output ONLY valid JSON array, no markdown, no explanation.`,
                    },
                    { role: 'user', content: prompt },
                ],
                temperature: 0.1,
                maxTokens: 1000,
            });

            const results = this.parseResponse(response.content, questions);
            await this.updateQuestions(results);
        } catch (error) {
            this.logger.error(`Batch annotation failed: ${error.message}`);
        }
    }

    private buildPrompt(
        questions: Array<{ _id: unknown; question_text: string }>,
    ): string {
        const questionList = questions
            .map((q, i) => `${i + 1}. [ID:${q._id}] ${q.question_text}`)
            .join('\n');

        return `Analyze these questions and return a JSON array with objects containing:
- id: the question ID
- concepts: array of 2-5 key concepts
- abstraction_level: 0-4 (0=recall, 1=understand, 2=apply, 3=analyze, 4=evaluate/create)
- reasoning_steps: estimated steps to solve (1-10)

Questions:
${questionList}

Return ONLY the JSON array:`;
    }

    private parseResponse(
        content: string,
        questions: Array<{ _id: unknown; question_text: string }>,
    ): BatchAnnotationResult[] {
        try {
            // Clean markdown code blocks if present
            let cleaned = content.trim();
            if (cleaned.startsWith('```')) {
                cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
            }

            const parsed = JSON.parse(cleaned);
            if (!Array.isArray(parsed)) {
                throw new Error('Expected array');
            }

            return parsed.map((item: { id?: string; concepts?: string[]; abstraction_level?: number; reasoning_steps?: number }, index: number) => ({
                question_id: item.id || String(questions[index]?._id),
                annotation: {
                    concepts: Array.isArray(item.concepts) ? item.concepts : [],
                    abstraction_level: Math.min(4, Math.max(0, item.abstraction_level || 0)),
                    reasoning_steps: Math.max(1, item.reasoning_steps || 1),
                },
            }));
        } catch (error) {
            this.logger.warn(`Failed to parse LLM response: ${error.message}`);
            return [];
        }
    }

    private async updateQuestions(
        results: BatchAnnotationResult[],
    ): Promise<void> {
        const bulkOps = results.map((r) => ({
            updateOne: {
                filter: { _id: r.question_id },
                update: { $set: { semantic: r.annotation } },
            },
        }));

        if (bulkOps.length > 0) {
            await this.questionModel.bulkWrite(bulkOps);
            this.logger.log(`Annotated ${results.length} questions`);
        }
    }
}
