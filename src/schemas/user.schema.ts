import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type UserDocument = User & Document;

export enum UserStatus {
    ACTIVE = 'ACTIVE',
    DISABLED = 'DISABLED',
}

@Schema({ timestamps: true })
export class User {
    @Prop({ required: true, unique: true, lowercase: true, trim: true })
    email: string;

    @Prop({ required: true })
    hashed_password: string;

    @Prop({ required: true, trim: true })
    name: string;

    @Prop({ type: String, enum: UserStatus, default: UserStatus.ACTIVE })
    status: UserStatus;

    @Prop({ type: Types.ObjectId, ref: 'Role', required: true })
    role_id: Types.ObjectId;
}

export const UserSchema = SchemaFactory.createForClass(User);
