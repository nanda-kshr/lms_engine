import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CourseDocument = Course & Document;

@Schema({ timestamps: true })
export class Course {
    @Prop({ required: true, unique: true })
    name: string;

    @Prop({ required: true, unique: true })
    code: string;

    @Prop()
    description?: string;
}

export const CourseSchema = SchemaFactory.createForClass(Course);
