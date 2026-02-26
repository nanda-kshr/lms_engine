import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ChunkDocument = Chunk & Document;

@Schema({ timestamps: true })
export class Chunk {
    @Prop({ type: Types.ObjectId, ref: 'Material', required: true })
    material_id: Types.ObjectId;

    @Prop({ required: true })
    course_code: string;

    @Prop({ required: true })
    text: string;

    @Prop({ type: [Number] }) // Vector embedding
    embedding?: number[];

    // Page number or section for citation
    @Prop()
    metadata?: string;

    // Optional: Concepts identified in this chunk
    @Prop({ type: [String], default: [] })
    concepts?: string[];
}

export const ChunkSchema = SchemaFactory.createForClass(Chunk);

// Create index for vector search (using special syntax if using Atlas Search, 
// but for basic mongo we might just store it. 
// Note: Standard MongoDB doesn't support vector search via '2dsphere', 
// usually requires Atlas Vector Search index. 
// For now, we'll store it as an array.
