import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type RoleDocument = Role & Document;

@Schema({ timestamps: true })
export class Role {
    @Prop({ required: true, unique: true })
    name: string;

    @Prop({ required: true })
    level: number;

    @Prop({ type: Object, default: {} })
    features: Record<string, boolean>;
}

export const RoleSchema = SchemaFactory.createForClass(Role);
