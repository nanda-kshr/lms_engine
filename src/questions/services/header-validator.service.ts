import { Injectable, BadRequestException } from '@nestjs/common';
import { CsvTemplateType, TEMPLATE_HEADERS } from '../templates/csv-templates';

@Injectable()
export class HeaderValidatorService {
    validate(headers: string[], templateType: CsvTemplateType): void {
        const requiredHeaders = TEMPLATE_HEADERS[templateType];
        const headerSet = new Set(headers);

        // Check for missing headers
        const missingHeaders: string[] = [];
        for (const required of requiredHeaders) {
            if (!headerSet.has(required)) {
                missingHeaders.push(required);
            }
        }

        if (missingHeaders.length > 0) {
            throw new BadRequestException(
                `Missing required headers for ${templateType}: ${missingHeaders.join(', ')}`,
            );
        }

        // Check for extra headers
        const requiredSet = new Set(requiredHeaders);
        const extraHeaders: string[] = [];
        for (const header of headers) {
            if (!requiredSet.has(header)) {
                extraHeaders.push(header);
            }
        }

        if (extraHeaders.length > 0) {
            throw new BadRequestException(
                `Unexpected headers for ${templateType}: ${extraHeaders.join(', ')}`,
            );
        }
    }
}
