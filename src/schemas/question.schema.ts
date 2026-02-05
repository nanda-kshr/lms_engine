import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

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

export enum VettingStatus {
    PENDING = 'pending',
    APPROVED = 'approved',
    REJECTED = 'rejected',
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

    // Optional course/topic scoping (nullable, no enforcement)
    @Prop()
    course_code?: string;

    @Prop()
    topic?: string;

    // Upload metadata
    @Prop({ required: true })
    upload_id: string;

    @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
    uploaded_by: Types.ObjectId;

    @Prop({ required: true })
    uploaded_at: Date;

    // Duplicate detection (warn only - still inserts)
    @Prop({ default: false })
    duplicate_warning: boolean;

    @Prop({ type: Types.ObjectId, ref: 'Question' })
    similar_question_id?: Types.ObjectId;

    @Prop({ min: 0, max: 1 })
    similarity_score?: number;

    // Vetting
    @Prop({ default: VettingStatus.PENDING, enum: VettingStatus })
    vetting_status: VettingStatus;

    @Prop({ type: Types.ObjectId, ref: 'User' })
    vetted_by?: Types.ObjectId;

    @Prop()
    vetted_at?: Date;

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

// Index for duplicate detection queries
QuestionSchema.index({ embedding: 1 });
