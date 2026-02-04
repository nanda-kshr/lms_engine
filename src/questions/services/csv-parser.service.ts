import { Injectable, BadRequestException } from '@nestjs/common';
import { parse } from 'csv-parse/sync';

export interface ParsedCsv {
    headers: string[];
    rows: Record<string, string>[];
}

@Injectable()
export class CsvParserService {
    parse(buffer: Buffer): ParsedCsv {
        if (!buffer || buffer.length === 0) {
            throw new BadRequestException('Empty file');
        }

        const content = buffer.toString('utf-8').trim();
        if (!content) {
            throw new BadRequestException('Empty file content');
        }

        let records: Record<string, string>[];
        try {
            records = parse(content, {
                columns: true,
                skip_empty_lines: true,
                trim: true,
                relaxColumnCount: false,
            });
        } catch (error) {
            throw new BadRequestException(`Malformed CSV: ${error.message}`);
        }

        if (records.length === 0) {
            throw new BadRequestException('CSV contains no data rows');
        }

        // Extract headers from first record keys
        const headers = Object.keys(records[0]).map((h) => h.toLowerCase().trim());

        // Check for duplicate headers
        const headerSet = new Set<string>();
        for (const header of headers) {
            if (headerSet.has(header)) {
                throw new BadRequestException(`Duplicate header: ${header}`);
            }
            headerSet.add(header);
        }

        // Normalize row keys to lowercase
        const normalizedRows = records.map((row) => {
            const normalized: Record<string, string> = {};
            for (const [key, value] of Object.entries(row)) {
                normalized[key.toLowerCase().trim()] = value;
            }
            return normalized;
        });

        return { headers, rows: normalizedRows };
    }
}
