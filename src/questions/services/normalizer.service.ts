import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { CsvTemplateType } from '../templates/csv-templates';
import {
    QuestionType,
    Difficulty,
    CoMap,
    McqOptions,
    VettingStatus,
} from '../../schemas/question.schema';

export interface UploadContext {
    upload_id: string;
    uploaded_by: string;
    uploaded_at: Date;
    default_course_code?: string;
    default_topic?: string;
}

export interface NormalizedQuestion {
    type: QuestionType;
    question_text: string;
    options?: McqOptions;
    correct_answer?: string;
    evaluation_criteria?: string;
    expected_points?: string[];
    key_points?: string[];
    word_limit?: number;
    CO_map: CoMap;
    LO_list: string[];
    difficulty: Difficulty;
    marks: number;
    source: string;
    // Optional course/topic scoping
    course_code?: string;
    topic?: string;
    upload_id: string;
    uploaded_by: Types.ObjectId;
    uploaded_at: Date;
    vetting_status: VettingStatus;
    // Duplicate fields - populated by DuplicateDetectorService
    duplicate_warning?: boolean;
    similar_question_id?: Types.ObjectId;
    similarity_score?: number;
}

@Injectable()
export class NormalizerService {
    normalize(
        rows: Record<string, string>[],
        templateType: CsvTemplateType,
        context: UploadContext,
    ): NormalizedQuestion[] {
        return rows.map((row) => this.normalizeRow(row, templateType, context));
    }

    private normalizeRow(
        row: Record<string, string>,
        templateType: CsvTemplateType,
        context: UploadContext,
    ): NormalizedQuestion {
        const courseCode = row['course_code']?.trim() || context.default_course_code;
        const topic = row['topic']?.trim() || context.default_topic;

        const base: NormalizedQuestion = {
            type: this.mapType(templateType),
            question_text: row['question'].trim(),
            CO_map: this.parseCoMap(row, templateType),
            LO_list: this.parseLo(row['lo mapping']),
            difficulty: row['difficulty'].trim() as Difficulty,
            marks: parseFloat(row['marks']),
            source: 'CSV',
            ...(courseCode && { course_code: courseCode }),
            ...(topic && { topic }),
            upload_id: context.upload_id,
            uploaded_by: new Types.ObjectId(context.uploaded_by),
            uploaded_at: context.uploaded_at,
            vetting_status: VettingStatus.PENDING,
        };

        switch (templateType) {
            case CsvTemplateType.MCQ:
                return {
                    ...base,
                    options: {
                        a: row['option_a'].trim(),
                        b: row['option_b'].trim(),
                        c: row['option_c'].trim(),
                        d: row['option_d'].trim(),
                    },
                    correct_answer: row['option_correct'].trim().toUpperCase(),
                };

            case CsvTemplateType.ESSAY:
                return {
                    ...base,
                    word_limit: parseInt(row['word limit'], 10),
                    expected_points: this.parseList(row['expected points']),
                    evaluation_criteria: row['expected points'].trim(),
                };

            case CsvTemplateType.SHORT:
                return {
                    ...base,
                    key_points: this.parseList(row['key points']),
                    evaluation_criteria: row['key points'].trim(),
                };
        }
    }

    private mapType(templateType: CsvTemplateType): QuestionType {
        const mapping: Record<CsvTemplateType, QuestionType> = {
            [CsvTemplateType.MCQ]: QuestionType.MCQ,
            [CsvTemplateType.ESSAY]: QuestionType.ESSAY,
            [CsvTemplateType.SHORT]: QuestionType.SHORT,
        };
        return mapping[templateType];
    }

    private parseCoMap(row: Record<string, string>, templateType: CsvTemplateType): CoMap {
        if (templateType === CsvTemplateType.MCQ) {
            const co = row['co']?.trim() || '';
            const coNumber = parseInt(co.replace(/\D/g, ''), 10) || 1;
            const coMap: CoMap = { CO1: 0, CO2: 0, CO3: 0, CO4: 0, CO5: 0 };
            const key = `CO${Math.min(5, Math.max(1, coNumber))}` as keyof CoMap;
            coMap[key] = 1;
            return coMap;
        }

        return {
            CO1: parseFloat(row['co1']) || 0,
            CO2: parseFloat(row['co2']) || 0,
            CO3: parseFloat(row['co3']) || 0,
            CO4: parseFloat(row['co4']) || 0,
            CO5: parseFloat(row['co5']) || 0,
        };
    }

    private parseLo(lo: string): string[] {
        if (!lo) return [];
        return lo
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean);
    }

    private parseList(value: string): string[] {
        if (!value) return [];
        return value
            .split(';')
            .map((item) => item.trim())
            .filter(Boolean);
    }
}
