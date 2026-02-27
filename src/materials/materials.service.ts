import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
// import * as pdfLib from 'pdf-parse';
import * as csv from 'csv-parse/sync';
const pdfLib = require('pdf-parse');
import { Material, MaterialDocument, MaterialType } from '../schemas/material.schema';
import { Chunk, ChunkDocument } from '../schemas/chunk.schema';
import { EmbeddingService } from '../questions/services/embedding.service';
import { LlmService } from '../llm/llm.service';

@Injectable()
export class MaterialsService {
    private readonly logger = new Logger(MaterialsService.name);

    constructor(
        @InjectModel(Material.name) private materialModel: Model<MaterialDocument>,
        @InjectModel(Chunk.name) private chunkModel: Model<ChunkDocument>,
        private embeddingService: EmbeddingService,
        private llmService: LlmService,
    ) { }

    async uploadMaterial(
        file: Express.Multer.File,
        courseCode: string,
        type: MaterialType,
        userId: string,
    ): Promise<Material> {
        this.logger.log(`Uploading material: ${file.originalname} (${type}) for ${courseCode}`);

        const material = new this.materialModel({
            filename: file.filename || file.originalname, // Multer gives filename if stored, or originalname
            original_name: file.originalname,
            mime_type: file.mimetype,
            size: file.size,
            path: file.path || 'memory', // If memory storage, path might be undefined
            course_code: courseCode,
            type: type,
            uploaded_by: new Types.ObjectId(userId),
        });

        await material.save();

        // Process asynchronously
        this.processMaterial(material._id.toString(), file.buffer).catch(err => {
            this.logger.error(`Async processing failed for material ${material._id}: ${err.message}`);
        });

        return material;
    }

    async processMaterial(materialId: string, buffer: Buffer) {
        const material = await this.materialModel.findById(materialId);
        if (!material) return;

        try {
            this.logger.log(`Processing material ${material._id} (${material.type})`);

            let text = '';
            let chunks: string[] = [];
            let concepts: string[] = [];
            let pageChunks: { text: string, metadata: string }[] = [];

            if (material.mime_type === 'application/pdf') {
                const { PDFParse } = require('pdf-parse');

                const parser = new PDFParse({ data: buffer });
                const data = await parser.getText();
                text = data.text || '';
                this.logger.log(`Extracted text length: ${text.length}, pages: ${data.pages?.length || 0}`);

                // pdf-parse v2 returns data.pages as { text, num }[]
                // Iterate pages directly to get accurate page numbers
                if (data.pages && data.pages.length > 0) {
                    for (const page of data.pages) {
                        const pageText = (page.text || '').replace(/\n\s*\n/g, '\n').trim();
                        if (pageText.length > 50) {
                            const subChunks = this.chunkText(pageText, 1000);
                            for (const sc of subChunks) {
                                pageChunks.push({
                                    text: sc,
                                    metadata: `Material: ${material.original_name}, Page: ${page.num}`
                                });
                            }
                        }
                    }
                    this.logger.log(`Created ${pageChunks.length} page chunks from ${data.pages.length} PDF pages`);
                }
            } else if (material.mime_type === 'text/csv' || material.mime_type === 'application/vnd.ms-excel') {
                // CSV Parsing is mainly for Syllabus, but can be generic text
                text = buffer.toString('utf-8');
            } else {
                text = buffer.toString('utf-8');
            }

            // 2. Parse based on Type

            if (material.type === MaterialType.SYLLABUS) {
                concepts = await this.extractConceptsFromSyllabus(text, material.mime_type);
            }

            // If PDF pages already created chunks above, skip this
            // Otherwise handle non-PDF files (CSV/Text)
            if (pageChunks.length === 0 && text.length > 0) {
                const subChunks = this.chunkText(text, 1000);
                for (const sc of subChunks) {
                    pageChunks.push({
                        text: sc,
                        metadata: `Material: ${material.original_name}, Page: 1`
                    });
                }
            }

            this.logger.log(`Finished chunking phase. Total sub-chunks generated: ${pageChunks.length}`);

            // 3. Save Chunks & Embed
            let embeddingsProcessed = 0;
            this.logger.log(`Beginning embedding generation for ${pageChunks.length} chunks...`);

            for (const chunkObj of pageChunks) {
                const embedding = await this.embeddingService.generateEmbeddingSync(chunkObj.text);

                await this.chunkModel.create({
                    material_id: material._id,
                    course_code: material.course_code,
                    text: chunkObj.text,
                    embedding: embedding || [],
                    concepts: concepts,
                    metadata: chunkObj.metadata
                });

                embeddingsProcessed++;
                if (embeddingsProcessed % 50 === 0) {
                    this.logger.log(`Embedded and saved ${embeddingsProcessed}/${pageChunks.length} chunks...`);
                }
            }

            // 4. Update Material Status
            material.is_processed = true;
            await material.save();
            this.logger.log(`Material ${material._id} processed successfully. Created ${pageChunks.length} chunks.`);

        } catch (error) {
            this.logger.error(`Failed to process material: ${error.message}`);
            material.processing_error = error.message;
            await material.save();
        }
    }

    private chunkText(text: string, chunkSize = 1000, overlap = 200): string[] {
        if (!text) return [];

        const separators = ['\n\n', '\n', ' ', ''];
        const chunks: string[] = [];
        let currentString = text;

        const splitText = (text: string, separators: string[]): string[] => {
            const finalChunks: string[] = [];
            let separator = separators[0];
            let newSeparators = separators.slice(1);
            let splits: string[] = [];

            // Find the best separator
            for (const sep of separators) {
                if (text.includes(sep)) {
                    separator = sep;
                    newSeparators = separators.slice(separators.indexOf(sep) + 1);
                    splits = text.split(sep);
                    break;
                }
            }

            // If no separator found (and we are at empty string separator), just char split
            if (splits.length === 0) {
                splits = [text];
            }

            let currentChunk: string[] = [];
            let currentLength = 0;

            for (const split of splits) {
                const splitLen = split.length;

                if (splitLen > chunkSize) {
                    // If a single split is too big, recurse
                    if (newSeparators.length > 0) {
                        // Flush current chunk if any
                        if (currentChunk.length > 0) {
                            finalChunks.push(currentChunk.join(separator));
                            currentChunk = [];
                            currentLength = 0;
                        }
                        finalChunks.push(...splitText(split, newSeparators));
                    } else {
                        // Hard split if no separators left
                        let remaining = split;
                        let bailout = 0;
                        while (remaining.length > chunkSize && bailout < 1000) {
                            finalChunks.push(remaining.substring(0, chunkSize));
                            remaining = remaining.substring(chunkSize - overlap);
                            bailout++;
                        }
                        if (bailout >= 1000) this.logger.warn("chunkText hit bailout limit!");
                        if (remaining.length > 0) finalChunks.push(remaining);
                    }
                } else {
                    if (currentLength + splitLen + (currentChunk.length > 0 ? separator.length : 0) > chunkSize) {
                        finalChunks.push(currentChunk.join(separator));
                        // Start new chunk with overlap if possible (simplified here: just start new)
                        // For better overlap, we'd keep some previous splits. 
                        // Simple sliding window:
                        currentChunk = [split];
                        currentLength = splitLen;
                    } else {
                        currentChunk.push(split);
                        currentLength += splitLen + (currentChunk.length > 0 ? separator.length : 0);
                    }
                }
            }

            if (currentChunk.length > 0) {
                finalChunks.push(currentChunk.join(separator));
            }

            return finalChunks;
        };

        return splitText(text, separators);
    }

    // Placeholder for concept extraction logic using heuristics or LLM
    private async extractConceptsFromSyllabus(text: string, mimeType: string): Promise<string[]> {
        let concepts: string[] = [];

        if (mimeType.includes('csv')) {
            try {
                const records = csv.parse(text, {
                    columns: true,
                    skip_empty_lines: true
                });

                for (const row of records as any[]) {
                    // Look for common headers
                    if (row['Topic']) concepts.push(row['Topic']);
                    else if (row['Concept']) concepts.push(row['Concept']);
                    else if (row['Content']) concepts.push(row['Content']);
                }
            } catch (e) {
                this.logger.warn(`Failed to parse CSV syllabus: ${e.message}`);
            }
        } else {
            // PDF / Text -> Use LLM
            try {
                this.logger.log('Extracting concepts from syllabus using LLM...');
                const prompt = `
You are an expert curriculum designer. Extract a list of key concepts, topics, and learning modules from the following syllabus text.
Return ONLY a valid JSON array of strings. Do not include markdown formatting or explanations.
Example: ["Concept A", "Concept B", "Topic C"]

Syllabus Text:
${text.substring(0, 15000)}
                `;

                const response = await this.llmService.complete({
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.1,
                });

                const content = response.content.replace(/```json/g, '').replace(/```/g, '').trim();
                // Ensure it looks like an array
                const start = content.indexOf('[');
                const end = content.lastIndexOf(']');
                if (start !== -1 && end !== -1) {
                    const jsonStr = content.substring(start, end + 1);
                    const parsed = JSON.parse(jsonStr);
                    if (Array.isArray(parsed)) {
                        concepts = parsed.map(String);
                    }
                }
            } catch (e) {
                this.logger.error(`LLM concept extraction failed: ${e.message}`);
                // Fallback to regex
                const lines = text.split('\n');
                for (const line of lines) {
                    if (line.match(/^(Unit|Module|Chapter)\s+\d+/i)) {
                        concepts.push(line.trim());
                    }
                }
            }
        }

        return concepts;
    }

    private cosineSimilarity(vecA: number[], vecB: number[]): number {
        if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        for (let i = 0; i < vecA.length; i++) {
            dotProduct += vecA[i] * vecB[i];
            normA += vecA[i] * vecA[i];
            normB += vecB[i] * vecB[i];
        }
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    async findSimilarChunks(embedding: number[], courseCode: string, limit: number = 3): Promise<ChunkDocument[]> {
        const chunks = await this.chunkModel.find({
            course_code: courseCode,
            embedding: { $exists: true, $not: { $size: 0 } }
        }).select('text embedding concepts metadata').lean();

        if (chunks.length === 0) return [];

        // Calculate similarity for each chunk
        const scoredChunks = chunks.map(chunk => ({
            chunk,
            score: this.cosineSimilarity(embedding, chunk.embedding || [])
        }));

        // Sort by score descending
        scoredChunks.sort((a, b) => b.score - a.score);

        return scoredChunks.slice(0, limit).map(item => item.chunk as ChunkDocument);
    }

    async getUserMaterials(userId: string): Promise<Material[]> {
        return this.materialModel.find({ uploaded_by: new Types.ObjectId(userId) })
            .sort({ createdAt: -1 })
            .limit(20)
            .exec();
    }

    async deleteMaterial(id: string, userId: string): Promise<void> {
        const material = await this.materialModel.findOne({
            _id: new Types.ObjectId(id),
            uploaded_by: new Types.ObjectId(userId),
        });

        if (!material) {
            throw new BadRequestException('Material not found or access denied');
        }

        // Delete associated chunks
        await this.chunkModel.deleteMany({ material_id: material._id });

        // Delete the material record
        await this.materialModel.deleteOne({ _id: material._id });

        this.logger.log(`Material ${id} and its chunks deleted by user ${userId}`);
    }
}
