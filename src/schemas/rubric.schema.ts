import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type RubricDocument = Rubric & Document;

@Schema({ timestamps: true })
export class Rubric {
    @Prop({ required: true })
    name: string;

    @Prop({ required: true })
    course_code: string;

    @Prop({ default: 1 })
    marks: number;

    @Prop({ default: 1 })
    total: number;

    @Prop({ type: Object, default: {} })
    co_distribution: Record<string, number>;

    @Prop({ type: Object, default: {} })
    lo_distribution: Record<string, number>;

    @Prop({ type: Object, default: {} })
    difficulty_distribution: Record<string, number>;

    @Prop({ type: [String], default: [] })
    topics: string[];

    @Prop({ default: 'Analytical' })
    question_style: string;

    @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
    created_by: Types.ObjectId;
}

export const RubricSchema = SchemaFactory.createForClass(Rubric);
