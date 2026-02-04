export enum CsvTemplateType {
    MCQ = 'MCQ',
    ESSAY = 'ESSAY',
    SHORT = 'SHORT',
}

// Detection headers - unique to each template (lowercase for comparison)
export const TEMPLATE_DETECTION_HEADERS: Record<CsvTemplateType, string> = {
    [CsvTemplateType.MCQ]: 'option_a',
    [CsvTemplateType.ESSAY]: 'word limit',
    [CsvTemplateType.SHORT]: 'key points',
};

// Required headers per template (all lowercase, spaces preserved)
export const MCQ_HEADERS = [
    'question',
    'option_a',
    'option_b',
    'option_c',
    'option_d',
    'option_correct',
    'co',
    'lo mapping',
    'difficulty',
    'marks',
] as const;

export const ESSAY_HEADERS = [
    'question',
    'expected points',
    'co1',
    'co2',
    'co3',
    'co4',
    'co5',
    'lo mapping',
    'difficulty',
    'marks',
    'word limit',
] as const;

export const SHORT_HEADERS = [
    'question',
    'key points',
    'co1',
    'co2',
    'co3',
    'co4',
    'co5',
    'lo mapping',
    'difficulty',
    'marks',
] as const;

export const TEMPLATE_HEADERS: Record<CsvTemplateType, readonly string[]> = {
    [CsvTemplateType.MCQ]: MCQ_HEADERS,
    [CsvTemplateType.ESSAY]: ESSAY_HEADERS,
    [CsvTemplateType.SHORT]: SHORT_HEADERS,
};

export const VALID_DIFFICULTIES = ['Easy', 'Medium', 'Hard'] as const;
export const VALID_CORRECT_OPTIONS = ['A', 'B', 'C', 'D'] as const;
