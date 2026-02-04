import { Test, TestingModule } from '@nestjs/testing';
import { readFileSync } from 'fs';
import { join } from 'path';
import { CsvParserService } from '../../src/questions/services/csv-parser.service';
import { TemplateDetectorService } from '../../src/questions/services/template-detector.service';
import { HeaderValidatorService } from '../../src/questions/services/header-validator.service';
import { RowValidatorService } from '../../src/questions/services/row-validator.service';
import { NormalizerService } from '../../src/questions/services/normalizer.service';
import { CsvTemplateType } from '../../src/questions/templates/csv-templates';

describe('Question Upload Pipeline', () => {
    let csvParser: CsvParserService;
    let templateDetector: TemplateDetectorService;
    let headerValidator: HeaderValidatorService;
    let rowValidator: RowValidatorService;
    let normalizer: NormalizerService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                CsvParserService,
                TemplateDetectorService,
                HeaderValidatorService,
                RowValidatorService,
                NormalizerService,
            ],
        }).compile();

        csvParser = module.get<CsvParserService>(CsvParserService);
        templateDetector = module.get<TemplateDetectorService>(TemplateDetectorService);
        headerValidator = module.get<HeaderValidatorService>(HeaderValidatorService);
        rowValidator = module.get<RowValidatorService>(RowValidatorService);
        normalizer = module.get<NormalizerService>(NormalizerService);
    });

    describe('MCQ CSV', () => {
        let buffer: Buffer;

        beforeAll(() => {
            buffer = readFileSync(join(__dirname, '../fixtures/mcq_sample.csv'));
        });

        it('should parse MCQ CSV', () => {
            const { headers, rows } = csvParser.parse(buffer);
            expect(headers).toContain('option_a');
            expect(rows.length).toBe(3);
        });

        it('should detect MCQ template', () => {
            const { headers } = csvParser.parse(buffer);
            const type = templateDetector.detect(headers);
            expect(type).toBe(CsvTemplateType.MCQ);
        });

        it('should validate MCQ headers', () => {
            const { headers } = csvParser.parse(buffer);
            const type = templateDetector.detect(headers);
            expect(() => headerValidator.validate(headers, type)).not.toThrow();
        });

        it('should validate MCQ rows', () => {
            const { headers, rows } = csvParser.parse(buffer);
            const type = templateDetector.detect(headers);
            const result = rowValidator.validate(rows, type);
            expect(result.valid.length).toBe(3);
            expect(result.errors.length).toBe(0);
        });

        it('should normalize MCQ rows', () => {
            const { rows } = csvParser.parse(buffer);
            const normalized = normalizer.normalize(rows, CsvTemplateType.MCQ, 'test-batch');
            expect(normalized.length).toBe(3);
            expect(normalized[0].type).toBe('MCQ');
            expect(normalized[0].options).toBeDefined();
            expect(normalized[0].correct_answer).toBe('B');
        });
    });

    describe('Essay CSV', () => {
        let buffer: Buffer;

        beforeAll(() => {
            buffer = readFileSync(join(__dirname, '../fixtures/essay_sample.csv'));
        });

        it('should parse Essay CSV', () => {
            const { headers, rows } = csvParser.parse(buffer);
            expect(headers).toContain('word limit');
            expect(rows.length).toBe(3);
        });

        it('should detect Essay template', () => {
            const { headers } = csvParser.parse(buffer);
            const type = templateDetector.detect(headers);
            expect(type).toBe(CsvTemplateType.ESSAY);
        });

        it('should validate Essay headers', () => {
            const { headers } = csvParser.parse(buffer);
            const type = templateDetector.detect(headers);
            expect(() => headerValidator.validate(headers, type)).not.toThrow();
        });

        it('should validate Essay rows', () => {
            const { headers, rows } = csvParser.parse(buffer);
            const type = templateDetector.detect(headers);
            const result = rowValidator.validate(rows, type);
            expect(result.valid.length).toBe(3);
            expect(result.errors.length).toBe(0);
        });

        it('should normalize Essay rows', () => {
            const { rows } = csvParser.parse(buffer);
            const normalized = normalizer.normalize(rows, CsvTemplateType.ESSAY, 'test-batch');
            expect(normalized.length).toBe(3);
            expect(normalized[0].type).toBe('ESSAY');
            expect(normalized[0].word_limit).toBe(500);
            expect(normalized[0].expected_points?.length).toBeGreaterThan(0);
        });
    });

    describe('Short Note CSV', () => {
        let buffer: Buffer;

        beforeAll(() => {
            buffer = readFileSync(join(__dirname, '../fixtures/short_sample.csv'));
        });

        it('should parse Short Note CSV', () => {
            const { headers, rows } = csvParser.parse(buffer);
            expect(headers).toContain('key points');
            expect(rows.length).toBe(3);
        });

        it('should detect Short Note template', () => {
            const { headers } = csvParser.parse(buffer);
            const type = templateDetector.detect(headers);
            expect(type).toBe(CsvTemplateType.SHORT);
        });

        it('should validate Short Note headers', () => {
            const { headers } = csvParser.parse(buffer);
            const type = templateDetector.detect(headers);
            expect(() => headerValidator.validate(headers, type)).not.toThrow();
        });

        it('should validate Short Note rows', () => {
            const { headers, rows } = csvParser.parse(buffer);
            const type = templateDetector.detect(headers);
            const result = rowValidator.validate(rows, type);
            expect(result.valid.length).toBe(3);
            expect(result.errors.length).toBe(0);
        });

        it('should normalize Short Note rows', () => {
            const { rows } = csvParser.parse(buffer);
            const normalized = normalizer.normalize(rows, CsvTemplateType.SHORT, 'test-batch');
            expect(normalized.length).toBe(3);
            expect(normalized[0].type).toBe('SHORT');
            expect(normalized[0].key_points?.length).toBeGreaterThan(0);
        });
    });
});
