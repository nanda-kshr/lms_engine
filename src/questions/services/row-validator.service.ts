import { Injectable } from '@nestjs/common';
import {
    CsvTemplateType,
    VALID_DIFFICULTIES,
    VALID_CORRECT_OPTIONS,
} from '../templates/csv-templates';

export interface RowError {
    row: number;
    reason: string;
}

export interface ValidationResult {
    valid: Record<string, string>[];
    errors: RowError[];
}

@Injectable()
export class RowValidatorService {
    validate(
        rows: Record<string, string>[],
        templateType: CsvTemplateType,
    ): ValidationResult {
        const valid: Record<string, string>[] = [];
        const errors: RowError[] = [];

        for (let i = 0; i < rows.length; i++) {
            const rowNumber = i + 2; // 1-indexed + header row
            const row = rows[i];
            const rowErrors = this.validateRow(row, templateType);

            if (rowErrors.length > 0) {
                errors.push({ row: rowNumber, reason: rowErrors.join('; ') });
            } else {
                valid.push(row);
            }
        }

        return { valid, errors };
    }

    private validateRow(
        row: Record<string, string>,
        templateType: CsvTemplateType,
    ): string[] {
        const errors: string[] = [];

        // Common validations
        errors.push(...this.validateCommon(row, templateType));

        // Type-specific validations
        switch (templateType) {
            case CsvTemplateType.MCQ:
                errors.push(...this.validateMcq(row));
                break;
            case CsvTemplateType.ESSAY:
                errors.push(...this.validateEssay(row));
                break;
            case CsvTemplateType.SHORT:
                errors.push(...this.validateShort(row));
                break;
        }

        return errors;
    }

    private validateCommon(row: Record<string, string>, templateType: CsvTemplateType): string[] {
        const errors: string[] = [];

        // Question length
        const question = row['question']?.trim() || '';
        if (question.length <= 10) {
            errors.push('question must be longer than 10 characters');
        }

        // Difficulty
        const difficulty = row['difficulty']?.trim();
        if (!difficulty || !VALID_DIFFICULTIES.includes(difficulty as 'Easy' | 'Medium' | 'Hard')) {
            errors.push(`difficulty must be one of: ${VALID_DIFFICULTIES.join(', ')}`);
        }

        // Marks
        const marks = parseFloat(row['marks']);
        if (isNaN(marks) || marks <= 0) {
            errors.push('marks must be greater than 0');
        }

        // LO mapping required
        const lo = row['lo mapping']?.trim();
        if (!lo) {
            errors.push('LO mapping is required');
        }

        // CO validation depends on template type
        if (templateType === CsvTemplateType.MCQ) {
            // MCQ has single CO column
            const co = row['co']?.trim();
            if (!co) {
                errors.push('CO is required');
            }
        } else {
            // Essay/Short have CO1-CO5 columns
            for (let i = 1; i <= 5; i++) {
                const coValue = parseFloat(row[`co${i}`]);
                if (isNaN(coValue) || coValue < 0) {
                    errors.push(`CO${i} must be >= 0`);
                }
            }
        }

        return errors;
    }

    private validateMcq(row: Record<string, string>): string[] {
        const errors: string[] = [];

        // Options A-D present
        const optionA = row['option_a']?.trim();
        const optionB = row['option_b']?.trim();
        const optionC = row['option_c']?.trim();
        const optionD = row['option_d']?.trim();

        if (!optionA) errors.push('option_a is required');
        if (!optionB) errors.push('option_b is required');
        if (!optionC) errors.push('option_c is required');
        if (!optionD) errors.push('option_d is required');

        // Options must be unique
        const options = [optionA, optionB, optionC, optionD].filter(Boolean);
        const uniqueOptions = new Set(options);
        if (options.length > 0 && uniqueOptions.size !== options.length) {
            errors.push('options A-D must be unique');
        }

        // Correct answer validation
        const correctAnswer = row['option_correct']?.trim().toUpperCase();
        if (!correctAnswer || !VALID_CORRECT_OPTIONS.includes(correctAnswer as 'A' | 'B' | 'C' | 'D')) {
            errors.push(`option_correct must be one of: ${VALID_CORRECT_OPTIONS.join(', ')}`);
        }

        return errors;
    }

    private validateEssay(row: Record<string, string>): string[] {
        const errors: string[] = [];

        // Word limit
        const wordLimit = parseInt(row['word limit'], 10);
        if (isNaN(wordLimit) || wordLimit <= 0) {
            errors.push('word limit must be greater than 0');
        }

        // Expected points required
        const expectedPoints = row['expected points']?.trim();
        if (!expectedPoints) {
            errors.push('expected points is required');
        }

        return errors;
    }

    private validateShort(row: Record<string, string>): string[] {
        const errors: string[] = [];

        // Key points required
        const keyPoints = row['key points']?.trim();
        if (!keyPoints) {
            errors.push('key points is required');
        }

        return errors;
    }
}
