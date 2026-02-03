import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type RefreshTokenDocument = RefreshToken & Document;

@Schema({ timestamps: true })
export class RefreshToken {
    @Prop({ required: true })
    token: string;

    @Prop({ type: Types.ObjectId, ref: 'User', required: true })
    user_id: Types.ObjectId;

    @Prop({ required: true })
    expires_at: Date;

    @Prop({ default: false })
    revoked: boolean;
}

export const RefreshTokenSchema = SchemaFactory.createForClass(RefreshToken);

// Index for cleanup queries
RefreshTokenSchema.index({ expires_at: 1 });
RefreshTokenSchema.index({ user_id: 1 });
