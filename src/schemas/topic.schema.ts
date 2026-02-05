import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type TopicDocument = Topic & Document;

@Schema({ timestamps: true })
export class Topic {
    @Prop({ required: true })
    name: string;

    @Prop({ required: true, type: Types.ObjectId, ref: 'Course' })
    course_id: Types.ObjectId;

    @Prop()
    description?: string;

    @Prop({ default: 0 })
    order: number;
}

export const TopicSchema = SchemaFactory.createForClass(Topic);
