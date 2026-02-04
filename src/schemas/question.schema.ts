import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type QuestionDocument = Question & Document;

export enum QuestionType {
    MCQ = 'MCQ',
    ESSAY = 'ESSAY',
    SHORT = 'SHORT',
}

export enum Difficulty {
    EASY = 'Easy',
    MEDIUM = 'Medium',
    HARD = 'Hard',
}

export class McqOptions {
    @Prop({ required: true })
    a: string;

    @Prop({ required: true })
    b: string;

    @Prop({ required: true })
    c: string;

    @Prop({ required: true })
    d: string;
}

export class CoMap {
    @Prop({ default: 0 })
    CO1: number;

    @Prop({ default: 0 })
    CO2: number;

    @Prop({ default: 0 })
    CO3: number;

    @Prop({ default: 0 })
    CO4: number;

    @Prop({ default: 0 })
    CO5: number;
}

export class SemanticAnnotation {
    @Prop({ type: [String], default: [] })
    concepts: string[];

    @Prop({ min: 0, max: 4 })
    abstraction_level: number;

    @Prop({ min: 0 })
    reasoning_steps: number;
}

@Schema({ timestamps: true })
export class Question {
    @Prop({ required: true, enum: QuestionType })
    type: QuestionType;

    @Prop({ required: true })
    question_text: string;

    // MCQ specific
    @Prop({ type: McqOptions })
    options?: McqOptions;

    @Prop({ enum: ['A', 'B', 'C', 'D'] })
    correct_answer?: string;

    // Essay/Short specific
    @Prop()
    evaluation_criteria?: string;

    @Prop({ type: [String] })
    expected_points?: string[];

    @Prop({ type: [String] })
    key_points?: string[];

    @Prop()
    word_limit?: number;

    // Common fields
    @Prop({ type: CoMap, required: true })
    CO_map: CoMap;

    @Prop({ type: [String], required: true })
    LO_list: string[];

    @Prop({ required: true, enum: Difficulty })
    difficulty: Difficulty;

    @Prop({ required: true, min: 0 })
    marks: number;

    @Prop({ default: 'CSV' })
    source: string;

    @Prop({ required: true })
    upload_batch_id: string;

    // Async-populated: Semantic annotation
    @Prop({ type: SemanticAnnotation })
    semantic?: SemanticAnnotation;

    // Async-populated: Embedding
    @Prop({ type: [Number] })
    embedding?: number[];

    @Prop()
    embedding_model?: string;
}

export const QuestionSchema = SchemaFactory.createForClass(Question);
