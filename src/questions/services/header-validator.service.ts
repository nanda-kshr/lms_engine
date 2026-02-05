import { Injectable, BadRequestException } from '@nestjs/common';
import { CsvTemplateType, TEMPLATE_HEADERS } from '../templates/csv-templates';

// Optional headers allowed for all template types
const OPTIONAL_HEADERS = ['course_code', 'topic'] as const;

@Injectable()
export class HeaderValidatorService {
    /**
     * Validates that all required headers for the template are present.
     * Throws BadRequestException if required headers are missing.
     * Optional headers (course_code, topic) are allowed but not required.
     */
    validate(headers: string[], templateType: CsvTemplateType): void {
        const requiredHeaders = TEMPLATE_HEADERS[templateType];
        const normalizedHeaders = headers.map((h) => h.toLowerCase().trim());

        // Check for missing required headers
        const missing = requiredHeaders.filter(
            (required) => !normalizedHeaders.includes(required),
        );

        if (missing.length > 0) {
            throw new BadRequestException(
                `Missing required headers for ${templateType}: ${missing.join(', ')}`,
            );
        }

        // Check for unexpected headers (excluding optional ones)
        const allowedHeaders = new Set([
            ...requiredHeaders,
            ...OPTIONAL_HEADERS,
        ]);

        const unexpected = normalizedHeaders.filter(
            (h) => !allowedHeaders.has(h),
        );

        if (unexpected.length > 0) {
            throw new BadRequestException(
                `Unexpected headers for ${templateType}: ${unexpected.join(', ')}`,
            );
        }
    }
}
