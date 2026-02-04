import { Injectable, BadRequestException } from '@nestjs/common';
import {
    CsvTemplateType,
    TEMPLATE_DETECTION_HEADERS,
} from '../templates/csv-templates';

@Injectable()
export class TemplateDetectorService {
    detect(headers: string[]): CsvTemplateType {
        const headerSet = new Set(headers);
        const matchedTemplates: CsvTemplateType[] = [];

        for (const [template, detectionHeader] of Object.entries(
            TEMPLATE_DETECTION_HEADERS,
        )) {
            if (headerSet.has(detectionHeader)) {
                matchedTemplates.push(template as CsvTemplateType);
            }
        }

        if (matchedTemplates.length === 0) {
            throw new BadRequestException(
                'Unable to detect question type. CSV must contain one of: option_a (MCQ), word_limit (Essay), key_points (Short Note)',
            );
        }

        if (matchedTemplates.length > 1) {
            throw new BadRequestException(
                `Ambiguous template: CSV matches multiple types (${matchedTemplates.join(', ')}). Use only one question type per file.`,
            );
        }

        return matchedTemplates[0];
    }
}
