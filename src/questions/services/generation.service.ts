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
    question_style?: string; // 'Analytical' | 'Theory' | 'Hybrid'
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
            const availableTopics = courseTopics.map(t => t.name);

            if (availableTopics.length === 0) {
                // Fallback if no topics found
                topics = ['General'];
            } else {
                for (let i = 0; i < totalNeeded; i++) {
                    const randomTopic = availableTopics[Math.floor(Math.random() * availableTopics.length)];
                    topics.push(randomTopic);
                }
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

            // A. Context Retrieval Pool
            let poolChunks: any[] = [];
            const contextStartTime = Date.now();
            try {
                // Embed topic + course code for context
                const embedding = await this.embeddingService.generateEmbeddingSync(`Course: ${blueprint.course_code}. Topic: ${topic}`);
                if (embedding) {
                    poolChunks = await this.materialsService.findSimilarChunks(embedding, blueprint.course_code, 15);
                }
            } catch (e) {
                this.logger.warn(`Context retrieval failed for ${topic}: ${e.message}`);
            }
            this.logger.log(`[Timer] Context Pool Retrieval for '${topic}' took ${Date.now() - contextStartTime}ms`);

            // B. Iterative Generation
            for (let i = 0; i < topicSlots.length; i++) {
                const slot = topicSlots[i];

                let contextStr = 'No specific context available.';
                let refMaterial = 'Unknown Material';
                let refPage = 'N/A';

                // Slice a window of 3 chunks for this specific question iteration
                if (poolChunks.length > 0) {
                    const safeOffset = (i * 2) % Math.max(1, poolChunks.length - 2);
                    const iterationChunks = poolChunks.slice(safeOffset, safeOffset + 3);

                    const uniqueMaterials = new Set<string>();
                    const uniquePages = new Set<string>();

                    contextStr = iterationChunks.map((c, idx) => {
                        let materialName = 'Unknown Material';
                        let pageNumber = 'N/A';

                        if (typeof c.metadata === 'string') {
                            const matMatch = c.metadata.match(/Material:\s*([^,]+)/i);
                            const pageMatch = c.metadata.match(/Page:\s*(\d+|unknown)/i);
                            if (matMatch && matMatch[1]) materialName = matMatch[1].trim();
                            if (pageMatch && pageMatch[1]) pageNumber = pageMatch[1].trim();
                        } else if (c.metadata && typeof c.metadata === 'object') {
                            const metaObj: any = c.metadata;
                            materialName = metaObj.source || metaObj.material || materialName;
                            pageNumber = metaObj.loc?.pageNumber || metaObj.page || pageNumber;
                        }

                        this.logger.debug(`[Metadata Debug] Chunk ${idx}: raw='${c.metadata}' => material='${materialName}', page='${pageNumber}'`);

                        if (materialName !== 'Unknown Material') uniqueMaterials.add(materialName);
                        if (pageNumber !== 'N/A' && pageNumber !== 'unknown') uniquePages.add(String(pageNumber));

                        // Clean chunk text: strip figure/chapter/page references so LLM doesn't parrot them
                        let cleanText = c.text.substring(0, 500);
                        cleanText = cleanText.replace(/\b(fig(ure)?|chapter|page|table|diagram|illustration|exhibit|appendix)\s*[\d.:]+\b/gi, '');
                        cleanText = cleanText.replace(/\bas (shown|depicted|illustrated|seen|given) (in|on|at|above|below)\b/gi, '');
                        cleanText = cleanText.replace(/\brefer(ring)?\s*(to)?\s*(fig|figure|page|chapter|table|diagram)/gi, '');

                        return cleanText.trim();
                    }).join('\n\n');

                    refMaterial = Array.from(uniqueMaterials).join(', ') || 'Unknown Material';
                    refPage = Array.from(uniquePages).join(', ') || 'N/A';
                }

                const questionStyle = blueprint.question_style || 'Analytical';
                this.logger.log(`[Prompt] Style=${questionStyle}, Difficulty=${slot.difficulty}, Topic=${topic}`);

                const styleInstruction = questionStyle === 'Theory'
                    ? 'The question MUST be purely theoretical — test definitions, concepts, or explanations. Do NOT include any calculations or numerical problems.'
                    : questionStyle === 'Hybrid'
                        ? 'The question MUST combine theory with a small analytical component — e.g., explain a concept then apply it to a given scenario.'
                        : 'The question MUST be analytical/numerical — it MUST require the student to perform a calculation, trace an algorithm, solve a recurrence, or analyze code output. Do NOT ask "what is" or definition-based questions.';

                const diffInstruction = slot.difficulty === 'Hard'
                    ? 'Make it GATE exam level — multi-step reasoning or tricky edge cases.'
                    : slot.difficulty === 'Easy'
                        ? 'Keep it basic recall or straightforward application.'
                        : 'Moderate difficulty requiring understanding and application.';

                const prompt = `Generate 1 MCQ on "${topic}". Do NOT reference any source material, page, figure, chapter, or diagram.
${styleInstruction}
${diffInstruction}

KNOWLEDGE:
${contextStr}

Return ONLY a single JSON object:
{"question_text":"...","type":"MCQ","options":{"a":"...","b":"...","c":"...","d":"..."},"correct_answer":"A|B|C|D","marks":${blueprint.marks},"difficulty":"${slot.difficulty}","CO_map":{"${slot.co}":1},"LO_list":["${slot.los[0] || 'LO1'}"]}
`;
                // C. Call LLM
                try {
                    const llmStartTime = Date.now();
                    const response = await this.llmService.complete({
                        messages: [{ role: 'user', content: prompt }],
                        temperature: 0.7,
                    });
                    this.logger.log(`[Timer] LLM generation call for '${topic}' Q${i + 1} took ${Date.now() - llmStartTime}ms`);

                    // D. Parse & Save
                    let cleaned = (response.content || '').trim();
                    if (cleaned.startsWith('```')) {
                        cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
                    }

                    let parsed: any;
                    try {
                        parsed = JSON.parse(cleaned);
                    } catch (e) {
                        this.logger.warn(`Initial JSON parsing failed for Q${i + 1}, invoking repair via LLM...`);
                        const repairStartTime = Date.now();
                        parsed = await this.llmService.repairJson(cleaned);
                        this.logger.log(`[Timer] LLM JSON Repair took ${Date.now() - repairStartTime}ms`);
                    }

                    // Format as array for mapping logic
                    const parsedArray = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);

                    if (parsedArray.length > 0) {
                        const uploadId = `AI-${Date.now()}`;
                        const toSave = parsedArray.map((q: any) => {
                            this.logger.debug(`Raw generated question: ${JSON.stringify(q)}`);

                            const options: any = q.options || {};
                            const normalizedOptions: Record<string, string> = {};

                            if (Array.isArray(options)) {
                                const keys = ['a', 'b', 'c', 'd'];
                                options.forEach((val, idx) => {
                                    if (idx < 4) normalizedOptions[keys[idx]] = String(val);
                                });
                            } else {
                                Object.keys(options).forEach(k => {
                                    const val = options[k];
                                    const lowerK = k.toLowerCase().trim();
                                    if (['1', '2', '3', '4'].includes(k)) {
                                        const map: any = { '1': 'a', '2': 'b', '3': 'c', '4': 'd' };
                                        normalizedOptions[map[k]] = val;
                                    } else if (['a', 'b', 'c', 'd'].includes(lowerK)) {
                                        normalizedOptions[lowerK] = val;
                                    }
                                });
                            }

                            if (Object.keys(normalizedOptions).length === 0 && q.type === 'MCQ') {
                                if (!Array.isArray(options)) {
                                    const keys = Object.keys(options);
                                    const targetKeys = ['a', 'b', 'c', 'd'];
                                    keys.slice(0, 4).forEach((k, idx) => {
                                        normalizedOptions[targetKeys[idx]] = options[k];
                                    });
                                }
                            }

                            let ans = String(q.correct_answer || '').trim();
                            if (/^[1-4]$/.test(ans)) {
                                const numMap: any = { '1': 'A', '2': 'B', '3': 'C', '4': 'D' };
                                ans = numMap[ans];
                            }
                            ans = ans.toUpperCase();

                            if (!['A', 'B', 'C', 'D'].includes(ans)) {
                                const key = Object.keys(normalizedOptions).find(k => normalizedOptions[k] === q.correct_answer || normalizedOptions[k] === ans);
                                if (key) ans = key.toUpperCase();
                            }

                            if (!['A', 'B', 'C', 'D'].includes(ans)) {
                                this.logger.warn(`Invalid correct_answer '${q.correct_answer}' for Q: ${q.question_text?.substring(0, 20)}... Defaulting to 'A'.`);
                                ans = 'A';
                            }

                            return {
                                ...q,
                                options: normalizedOptions,
                                correct_answer: ans,
                                source: 'AI',
                                vetting_status: VettingStatus.PENDING,
                                weight: 1.0,
                                course_code: blueprint.course_code,
                                topic: topic,
                                reference_material: q.reference_material || refMaterial,
                                reference_page: String(q.reference_page || refPage),
                                marks: blueprint.marks,
                                uploaded_by: userId,
                                uploaded_at: new Date(),
                                upload_id: uploadId,
                                CO_map: (q.CO_map && Object.keys(q.CO_map).length > 0) ? q.CO_map : { [slot.co || 'CO1']: 1 },
                                LO_list: (q.LO_list && Array.isArray(q.LO_list) && q.LO_list.length > 0) ? q.LO_list : (slot.los.length > 0 ? [slot.los[0]] : ['LO1']),
                                difficulty: q.difficulty || slot.difficulty || 'Medium',
                            }
                        });

                        const dbSaveStartTime = Date.now();
                        const saved = await this.questionModel.insertMany(toSave);
                        this.logger.log(`[Timer] Database saving ${toSave.length} question took ${Date.now() - dbSaveStartTime}ms`);

                        generatedQuestions.push(...(saved as unknown as QuestionDocument[]));
                    }
                } catch (err) {
                    this.logger.error(`Failed to generate question ${i + 1} for ${topic}: ${err.message}`);
                }
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
