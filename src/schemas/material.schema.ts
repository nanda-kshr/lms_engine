import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type MaterialDocument = Material & Document;

export enum MaterialType {
    SYLLABUS = 'SYLLABUS',
    CONTENT = 'CONTENT', // Books, Notes, etc.
}

@Schema({ timestamps: true })
export class Material {
    @Prop({ required: true })
    filename: string;

    @Prop({ required: true })
    original_name: string;

    @Prop({ required: true })
    mime_type: string;

    @Prop({ required: true })
    size: number;

    @Prop({ required: true })
    path: string; // Storage path or URL

    @Prop({ required: true })
    course_code: string;

    @Prop({ required: true, enum: MaterialType })
    type: MaterialType;

    @Prop({ type: Types.ObjectId, ref: 'User', required: true })
    uploaded_by: Types.ObjectId;

    @Prop({ default: false })
    is_processed: boolean;

    @Prop()
    processing_error?: string;
}

export const MaterialSchema = SchemaFactory.createForClass(Material);
