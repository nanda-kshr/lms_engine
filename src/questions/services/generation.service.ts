import { Injectable, Logger, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
    Question,
    QuestionDocument,
    VettingStatus,
    CoMap,
} from '../../schemas/question.schema';
import { LlmService } from '../../llm';
import { EmbeddingService } from './embedding.service';
import { MaterialsService } from '../../materials/materials.service';
import { CoursesService } from '../../courses/courses.service';

// ── Types ──────────────────────────────────────────────
export interface GenerationBlueprint {
    course_code: string;
    topics?: string[]; // Optional filtered topics
    marks: number;
    total: number;
    co_distribution: Record<string, number>;   // e.g. { CO2: 4, CO4: 5, CO1: 1 }
    lo_distribution: Record<string, number>;   // e.g. { LO1: 2, LO2: 3 }
    difficulty_distribution: Record<string, number>; // e.g. { Hard: 4, Medium: 3, Easy: 3 }
}

interface TaggedQuestion {
    doc: QuestionDocument;
    primaryCO: string;
    los: string[];
    difficulty: string;
}

export interface GenerationResult {
    paper: QuestionDocument[];
    stats: {
        total: number;
        from_bank: number;
        ai_generated: number;
        by_co: Record<string, number>;
        by_lo: Record<string, number>;
        by_difficulty: Record<string, number>;
        total_marks: number;
    };
    gaps?: {
        co: Record<string, number>;
        lo: Record<string, number>;
        difficulty: Record<string, number>;
    };
}

import { ConfigService } from '@nestjs/config';


@Injectable()
export class GenerationService {
    private readonly logger = new Logger(GenerationService.name);

    constructor(
        @InjectModel(Question.name)
        private readonly questionModel: Model<QuestionDocument>,
        private readonly llmService: LlmService,
        private readonly embeddingService: EmbeddingService,
        private readonly configService: ConfigService,
        @Inject(forwardRef(() => MaterialsService)) private readonly materialsService: MaterialsService,
        private readonly coursesService: CoursesService,
    ) { }

    // ── Main entry point ───────────────────────────────
    async generatePaper(blueprint: GenerationBlueprint, userId: string): Promise<GenerationResult> {
        const generationStartTime = Date.now();
        this.validateBlueprint(blueprint);

        this.logger.log(`Forcing AI generation for all ${blueprint.total} questions as requested.`);

        // The "gaps" are now the entire blueprint since we don't take from bank
        let currentGaps = {
            co: { ...blueprint.co_distribution },
            lo: { ...blueprint.lo_distribution },
            difficulty: { ...blueprint.difficulty_distribution },
        };

        const generated: QuestionDocument[] = [];
        const MAX_ATTEMPTS = 3;

        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
            this.logger.log(`Generation Attempt ${attempt + 1}/${MAX_ATTEMPTS} for gaps: ${JSON.stringify(currentGaps)}`);

            // Phase 2: Internal RAG generation for the full set (or remaining gaps)
            const batch = await this.ragGenerate(currentGaps, blueprint, userId);
            generated.push(...batch);

            // Re-calculate gaps
            const tagged: TaggedQuestion[] = generated.map(d => ({
                doc: d,
                primaryCO: this.getPrimaryCO(d.CO_map),
                los: d.LO_list || [],
                difficulty: d.difficulty
            }));

            const remaining = this.computeGaps(tagged, blueprint);

            // Check if we are done (total count match is a quick check, but gaps check is better)
            const needed = Object.values(remaining.co).reduce((a, b) => a + b, 0);
            if (needed <= 0) break;

            currentGaps = remaining;
        }

        // Build stats (from_bank is now always 0)
        const stats = this.buildStats(generated, 0, blueprint);

        const totalDurationMs = Date.now() - generationStartTime;
        this.logger.log(`[Timer] Overall Paper Generation completed in ${totalDurationMs}ms (${(totalDurationMs / 1000).toFixed(2)}s) for ${generated.length} questions.`);

        return {
            paper: generated,
            stats,
        };
    }

    // ── Validation ─────────────────────────────────────
    private validateBlueprint(bp: GenerationBlueprint): void {
        const coTotal = Object.values(bp.co_distribution).reduce((a, b) => a + b, 0);
        const loTotal = Object.values(bp.lo_distribution).reduce((a, b) => a + b, 0);
        const diffTotal = Object.values(bp.difficulty_distribution).reduce((a, b) => a + b, 0);

        if (coTotal !== bp.total) {
            throw new BadRequestException(
                `CO distribution sums to ${coTotal}, expected ${bp.total}`,
            );
        }
        if (loTotal !== bp.total) {
            throw new BadRequestException(
                `LO distribution sums to ${loTotal}, expected ${bp.total}`,
            );
        }
        if (diffTotal !== bp.total) {
            throw new BadRequestException(
                `Difficulty distribution sums to ${diffTotal}, expected ${bp.total}`,
            );
        }
    }

    // ── Phase 1: Bank Retrieval ────────────────────────
    private async retrieveFromBank(
        blueprint: GenerationBlueprint,
    ): Promise<TaggedQuestion[]> {
        const questions = await this.questionModel
            .find({
                course_code: blueprint.course_code,
                marks: blueprint.marks,
                vetting_status: VettingStatus.APPROVED,
            })
            .select('-embedding -embedding_model')
            .sort({ weight: -1 })
            .lean();

        this.logger.log(
            `Found ${questions.length} approved questions for ${blueprint.course_code} @ ${blueprint.marks} marks`,
        );

        return questions.map((doc) => ({
            doc: doc as QuestionDocument,
            primaryCO: this.getPrimaryCO(doc.CO_map),
            los: doc.LO_list || [],
            difficulty: doc.difficulty,
        }));
    }

    // ── Primary CO extraction ──────────────────────────
    private getPrimaryCO(coMap: CoMap): string {
        let best = 'CO1';
        let bestVal = 0;
        const keys: (keyof CoMap)[] = ['CO1', 'CO2', 'CO3', 'CO4', 'CO5'];
        for (const k of keys) {
            if ((coMap[k] ?? 0) > bestVal) {
                bestVal = coMap[k];
                best = k;
            }
        }
        return best;
    }

    // ── Phase 1: Constraint Solver ─────────────────────
    private solveConstraints(
        pool: TaggedQuestion[],
        bp: GenerationBlueprint,
    ): TaggedQuestion[] {
        // Remaining budgets
        const coBudget = { ...bp.co_distribution };
        const loBudget = { ...bp.lo_distribution };
        const diffBudget = { ...bp.difficulty_distribution };
        const selected: TaggedQuestion[] = [];
        const usedIds = new Set<string>();

        // Greedy: pick questions that satisfy all 3 constraints
        for (const q of pool) {
            if (selected.length >= bp.total) break;

            const id = (q.doc as any)._id?.toString();
            if (usedIds.has(id)) continue;

            const co = q.primaryCO;
            const diff = q.difficulty;

            // Check CO and difficulty budgets
            if ((coBudget[co] ?? 0) <= 0) continue;
            if ((diffBudget[diff] ?? 0) <= 0) continue;

            // Check if any LO matches budget
            const matchingLO = q.los.find((lo) => (loBudget[lo] ?? 0) > 0);
            if (!matchingLO) continue;

            // Pick it
            coBudget[co]--;
            loBudget[matchingLO]--;
            diffBudget[diff]--;
            usedIds.add(id);
            selected.push(q);
        }

        this.logger.log(`Constraint solver selected ${selected.length}/${bp.total} from bank`);
        return selected;
    }

    // ── Gap Computation ────────────────────────────────
    private computeGaps(
        selected: TaggedQuestion[],
        bp: GenerationBlueprint,
    ): { co: Record<string, number>; lo: Record<string, number>; difficulty: Record<string, number> } {
        const co = { ...bp.co_distribution };
        const lo = { ...bp.lo_distribution };
        const diff = { ...bp.difficulty_distribution };

        for (const q of selected) {
            co[q.primaryCO] = Math.max(0, (co[q.primaryCO] ?? 0) - 1);
            diff[q.difficulty] = Math.max(0, (diff[q.difficulty] ?? 0) - 1);
            const matchingLO = q.los.find((l) => (lo[l] ?? 0) > 0);
            if (matchingLO) {
                lo[matchingLO] = Math.max(0, (lo[matchingLO] ?? 0) - 1);
            }
        }

        // Remove zeros
        for (const map of [co, lo, diff]) {
            for (const k of Object.keys(map)) {
                if (map[k] === 0) delete map[k];
            }
        }

        return { co, lo, difficulty: diff };
    }

    // ── Phase 2: RAG Generation ────────────────────────
    private async ragGenerate(
        gaps: { co: Record<string, number>; lo: Record<string, number>; difficulty: Record<string, number> },
        blueprint: GenerationBlueprint,
        userId: string,
    ): Promise<QuestionDocument[]> {
        const totalNeeded = Object.values(gaps.co).reduce((a, b) => a + b, 0);
        const generatedQuestions: QuestionDocument[] = [];

        // 1. Determine Topics
        let topics: string[] = blueprint.topics || [];
        if (topics.length === 0) {
            // Fetch topics from course
            const courseTopics = await this.coursesService.getTopics(blueprint.course_code);
            topics = courseTopics.map(t => t.name);
            if (topics.length === 0) {
                // Fallback if no topics found
                topics = ['General'];
            }
        }
        this.logger.log(`RAG Generation using topics: ${topics.join(', ')}`);

        // 2. Distribute Gaps across Topics
        // Strategy: Round-robin assignment of requirements to topics
        // We need to generate `totalNeeded` questions satisfying specific CO/LO/Diff constraints.
        // We'll iterate through the gaps and assign each "slot" to a topic.

        const slots: Array<{
            topic: string;
            co: string;
            difficulty: string;
            los: string[];
        }> = [];

        const gapCo = { ...gaps.co };
        const gapDiff = { ...gaps.difficulty };
        const gapLo = { ...gaps.lo }; // LOs are tricky because we need *one* match usually, but here we list available ones.

        // Flatten requirements into slots
        // This is a bit complex constraint solving.
        // Simplified approach: Iterate count. For each count, pick a valid CO, Diff, LO.
        // Assign to a topic round-robin.

        for (let i = 0; i < totalNeeded; i++) {
            // Pick a CO
            const co = Object.keys(gapCo).find(k => gapCo[k] > 0);
            if (!co) break;
            gapCo[co]--;

            // Pick a Diff
            const diff = Object.keys(gapDiff).find(k => gapDiff[k] > 0);
            if (!diff) {
                // Should not happen if totals match, but safety
                gapCo[co]++; // backtrack? No, just break
                break;
            }
            gapDiff[diff]--;

            // Pick available LOs (just pass all valid ones for this slot)
            const los = Object.keys(gapLo).filter(k => gapLo[k] > 0);
            // We don't decrement LOs here stricly if we assume >= 1 usage.
            // But let's verify if we need strict counts. The prompt handles LOs array.
            // We'll pass pertinent LOs.

            const topic = topics[i % topics.length];
            slots.push({ topic, co, difficulty: diff, los });
        }

        // 3. Group by Topic for Batch Generation
        const questionsByTopic: Record<string, typeof slots> = {};
        for (const slot of slots) {
            if (!questionsByTopic[slot.topic]) questionsByTopic[slot.topic] = [];
            questionsByTopic[slot.topic].push(slot);
        }

        // 4. Process each Topic Batch
        for (const [topic, topicSlots] of Object.entries(questionsByTopic)) {
            const topicStartTime = Date.now();
            this.logger.log(`Generating ${topicSlots.length} questions for topic: ${topic}`);

            // A. Context Retrieval
            let contextStr = '';
            const contextStartTime = Date.now();
            try {
                // Embed topic + course code for context
                const embedding = await this.embeddingService.generateEmbeddingSync(`Course: ${blueprint.course_code}. Topic: ${topic}`);
                if (embedding) {
                    const chunks = await this.materialsService.findSimilarChunks(embedding, blueprint.course_code, 3);
                    contextStr = chunks.map((c, i) => `[METADATA: ${c.metadata || 'Unknown'}]\nContext ${i + 1}: ${c.text.substring(0, 500)}...`).join('\n\n');
                }
            } catch (e) {
                this.logger.warn(`Context retrieval failed for ${topic}: ${e.message}`);
                contextStr = 'No specific context available.';
            }
            this.logger.log(`[Timer] Context Retrieval for '${topic}' took ${Date.now() - contextStartTime}ms`);

            // B. Construct Prompt for Batch
            const prompt = `
Generate ${topicSlots.length} questions for Course "${blueprint.course_code}", Topic "${topic}".

CONTEXT FROM MATERIALS:
${contextStr}

REQUIREMENTS:
${topicSlots.map((slot, i) =>
                `Q${i + 1}: CO=${slot.co}, Difficulty=${slot.difficulty}, Marks=${blueprint.marks}, LOs=[${slot.los.join(', ')}]`
            ).join('\n')}

STRICT JSON OUTPUT RULES:
1. Return ONLY a single valid JSON array of objects.
2. \`correct_answer\` MUST be exactly one of: "A", "B", "C", or "D". Do NOT use numbers (1) or full text.
3. \`LO_list\` MUST be an array of strings, e.g., ["LO1", "LO2"]. Do NOT return objects like [{"Level": 1}].
4. \`CO_map\` must be an object like {"CO1": 1}.
5. \`type\` must be "MCQ".
6. Ensure EVERY question has a \`correct_answer\` field corresponding to an option key.
7. Include \`reference_material\` (the original material name) and \`reference_page\` (the page number) based ONLY on the metadata tags found in the CONTEXT FROM MATERIALS blocks above.

EXAMPLE JSON FORMAT:
[
  {
    "question_text": "Question text?",
    "type": "MCQ",
    "options": { "a": "Option 1", "b": "Option 2", "c": "Option 3", "d": "Option 4" },
    "correct_answer": "A",
    "marks": ${blueprint.marks},
    "difficulty": "Medium",
    "CO_map": { "CO1": 1 },
    "LO_list": ["LO1"],
    "reference_material": "Textbook.pdf",
    "reference_page": "42"
  }
]
`;
            // C. Call LLM
            try {
                const llmStartTime = Date.now();
                const response = await this.llmService.complete({
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.7,
                });
                this.logger.log(`[Timer] LLM generation call for '${topic}' took ${Date.now() - llmStartTime}ms`);

                // D. Parse & Save
                // Reuse existing repair/parsing logic from previous implementation
                // We'll just copy the parsing block or refactor it into a helper.
                // For now, I'll inline the parsing logic to be safe.

                let cleaned = (response.content || '').trim();
                if (cleaned.startsWith('```')) {
                    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
                }

                let parsed: any[];
                try {
                    parsed = JSON.parse(cleaned);
                } catch (e) {
                    this.logger.warn(`Initial JSON parsing failed, invoking repair via LLM...`);
                    const repairStartTime = Date.now();
                    parsed = await this.llmService.repairJson(cleaned);
                    this.logger.log(`[Timer] LLM JSON Repair took ${Date.now() - repairStartTime}ms`);
                }

                if (Array.isArray(parsed)) {
                    const uploadId = `AI-${Date.now()}`;
                    const toSave = parsed.map((q: any, i) => {
                        // Log the raw question for debugging
                        this.logger.debug(`Raw generated question: ${JSON.stringify(q)}`);

                        // Normalize options to lowercase keys (a, b, c, d)
                        const options = q.options || {};
                        const normalizedOptions: Record<string, string> = {};

                        if (Array.isArray(options)) {
                            // Handle array options ['A', 'B', 'C', 'D']
                            const keys = ['a', 'b', 'c', 'd'];
                            options.forEach((val, idx) => {
                                if (idx < 4) normalizedOptions[keys[idx]] = String(val);
                            });
                        } else {
                            // Handle object options
                            Object.keys(options).forEach(k => {
                                const val = options[k];
                                const lowerK = k.toLowerCase().trim();
                                // Map numeric keys 1-4 to a-d
                                if (['1', '2', '3', '4'].includes(k)) {
                                    const map: any = { '1': 'a', '2': 'b', '3': 'c', '4': 'd' };
                                    normalizedOptions[map[k]] = val;
                                } else if (['a', 'b', 'c', 'd'].includes(lowerK)) {
                                    normalizedOptions[lowerK] = val;
                                }
                            });
                        }

                        // Robust handling for correct_answer
                        let ans = String(q.correct_answer || '').trim();

                        // 1. Handle numeric answers (1->A, 2->B, etc) commonly returned by LLMs
                        if (/^[1-4]$/.test(ans)) {
                            const numMap: any = { '1': 'A', '2': 'B', '3': 'C', '4': 'D' };
                            ans = numMap[ans];
                        }

                        // Ensure answer is uppercase (A, B, C, D) for storage consistency
                        // But wait, if options are keyed a,b,c,d, the answer referencing them should probably allow case-insensitive match
                        // The frontend usually expects uppercase Correct Answer but the option keys to be a/b/c/d?
                        // Let's check the Question model in frontend. 
                        // It stores correct_answer as string. The UI implementation checks:
                        // question.correctAnswer?.toUpperCase() == key.toUpperCase()
                        // So format of correct_answer doesn't strictly matter as long as it is A/B/C/D.

                        ans = ans.toUpperCase();

                        // If ans is not A/B/C/D, try to find the key by value match
                        if (!['A', 'B', 'C', 'D'].includes(ans)) {
                            // value match against normalized options
                            // normalized keys are a,b,c,d
                            const key = Object.keys(normalizedOptions).find(k => normalizedOptions[k] === q.correct_answer || normalizedOptions[k] === ans);
                            if (key) ans = key.toUpperCase();
                        }

                        // Last resort: if still invalid, log and default to 'A'
                        if (!['A', 'B', 'C', 'D'].includes(ans)) {
                            this.logger.warn(`Invalid correct_answer '${q.correct_answer}' for Q: ${q.question_text?.substring(0, 20)}... Defaulting to 'A'.`);
                            ans = 'A';
                        }

                        // Ensure we have options if it is MCQ
                        if (Object.keys(normalizedOptions).length === 0 && q.type === 'MCQ') {
                            // Fallback: try to pull keys blindly if normalization failed
                            if (!Array.isArray(options)) {
                                const keys = Object.keys(options);
                                const targetKeys = ['a', 'b', 'c', 'd'];
                                keys.slice(0, 4).forEach((k, i) => {
                                    normalizedOptions[targetKeys[i]] = options[k];
                                });
                            }
                        }

                        return {
                            ...q,
                            options: normalizedOptions,
                            correct_answer: ans,
                            source: 'AI',
                            vetting_status: VettingStatus.PENDING,
                            weight: 1.0,
                            course_code: blueprint.course_code,
                            topic: topic, // Tag with specific topic
                            // Add references
                            reference_material: q.reference_material || '',
                            reference_page: String(q.reference_page || ''),
                            // Ensuring fields match schema
                            marks: blueprint.marks,
                            uploaded_by: userId,
                            uploaded_at: new Date(),
                            upload_id: uploadId,
                            CO_map: q.CO_map || { [topicSlots[i]?.co || 'CO1']: 1 }, // Fallback to slot CO
                            difficulty: q.difficulty || topicSlots[i]?.difficulty || 'Medium',
                        }
                    });

                    const dbSaveStartTime = Date.now();
                    const saved = await this.questionModel.insertMany(toSave);
                    this.logger.log(`[Timer] Database saving ${toSave.length} questions took ${Date.now() - dbSaveStartTime}ms`);

                    generatedQuestions.push(...(saved as unknown as QuestionDocument[]));
                }

            } catch (err) {
                this.logger.error(`Failed to generate batch for ${topic}: ${err.message}`);
            }
            this.logger.log(`[Timer] Total Topic Batch processing for '${topic}' took ${Date.now() - topicStartTime}ms`);
        }

        return generatedQuestions;
    }

    // ── Stats Builder ──────────────────────────────────
    private buildStats(
        questions: QuestionDocument[],
        bankCount: number,
        bp: GenerationBlueprint,
    ) {
        const byCo: Record<string, number> = {};
        const byLo: Record<string, number> = {};
        const byDiff: Record<string, number> = {};

        for (const q of questions) {
            const co = this.getPrimaryCO(q.CO_map);
            byCo[co] = (byCo[co] ?? 0) + 1;

            for (const lo of q.LO_list || []) {
                byLo[lo] = (byLo[lo] ?? 0) + 1;
            }

            byDiff[q.difficulty] = (byDiff[q.difficulty] ?? 0) + 1;
        }

        return {
            total: questions.length,
            from_bank: bankCount,
            ai_generated: questions.length - bankCount,
            by_co: byCo,
            by_lo: byLo,
            by_difficulty: byDiff,
            total_marks: questions.length * bp.marks,
        };
    }
}
