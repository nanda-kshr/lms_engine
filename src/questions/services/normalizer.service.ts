import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { CsvTemplateType } from '../templates/csv-templates';
import {
    QuestionType,
    Difficulty,
    CoMap,
    McqOptions,
} from '../../schemas/question.schema';

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
    upload_batch_id: string;
}

@Injectable()
export class NormalizerService {
    normalize(
        rows: Record<string, string>[],
        templateType: CsvTemplateType,
        batchId?: string,
    ): NormalizedQuestion[] {
        const uploadBatchId = batchId || uuidv4();

        return rows.map((row) => this.normalizeRow(row, templateType, uploadBatchId));
    }

    private normalizeRow(
        row: Record<string, string>,
        templateType: CsvTemplateType,
        uploadBatchId: string,
    ): NormalizedQuestion {
        const base: NormalizedQuestion = {
            type: this.mapType(templateType),
            question_text: row['question'].trim(),
            CO_map: this.parseCoMap(row, templateType),
            LO_list: this.parseLo(row['lo mapping']),
            difficulty: row['difficulty'].trim() as Difficulty,
            marks: parseFloat(row['marks']),
            source: 'CSV',
            upload_batch_id: uploadBatchId,
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
            // MCQ has single CO column like "CO1" or "CO2"
            const co = row['co']?.trim() || '';
            const coNumber = parseInt(co.replace(/\D/g, ''), 10) || 1;
            const coMap: CoMap = { CO1: 0, CO2: 0, CO3: 0, CO4: 0, CO5: 0 };
            const key = `CO${Math.min(5, Math.max(1, coNumber))}` as keyof CoMap;
            coMap[key] = 1;
            return coMap;
        }

        // Essay/Short have CO1-CO5 columns
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
        // Support semicolon separated (primary format in samples)
        return value
            .split(';')
            .map((item) => item.trim())
            .filter(Boolean);
    }
}
