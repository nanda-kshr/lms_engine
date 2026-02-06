import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
    Question,
    QuestionDocument,
    VettingAction,
    VettingStatus,
} from '../../schemas/question.schema';

export interface VettingFilters {
    vetting_status?: VettingStatus;
    course_code?: string;
    topic?: string;
    duplicate_warning?: boolean;
}

export interface VettingResult {
    success: boolean;
    weight: number;
    vetting_status: VettingStatus;
    accept_count: number;
    reject_count: number;
    skip_count: number;
}

@Injectable()
export class VettingService {
    constructor(
        @InjectModel(Question.name)
        private readonly questionModel: Model<QuestionDocument>,
    ) { }

    /**
     * Vet a question. Enforces:
     * - User can only vet once per question (DB-level check)
     * - Updates counts, weight, status atomically
     */
    async vet(
        questionId: string,
        userId: string,
        action: VettingAction,
        reason?: string,
    ): Promise<VettingResult> {
        const userObjectId = new Types.ObjectId(userId);

        // Find question AND check user hasn't already vetted (atomic)
        const question = await this.questionModel.findOne({
            _id: questionId,
            'vetting_logs.user_id': { $ne: userObjectId },
        });

        if (!question) {
            // Distinguish between not found vs already vetted
            const exists = await this.questionModel.exists({ _id: questionId });
            if (!exists) {
                throw new NotFoundException('Question not found');
            }
            throw new BadRequestException('You have already vetted this question');
        }

        // Calculate weight delta based on action and duplicate_warning
        const weightDelta = this.calculateWeightDelta(action, question.duplicate_warning);

        // Calculate new weight (clamped)
        const newWeight = this.clamp(question.weight + weightDelta, 0.2, 2.0);

        // Calculate new counts
        const newAcceptCount =
            question.accept_count + (action === VettingAction.ACCEPT ? 1 : 0);
        const newRejectCount =
            question.reject_count + (action === VettingAction.REJECT ? 1 : 0);
        const newSkipCount =
            question.skip_count + (action === VettingAction.SKIP ? 1 : 0);

        // Derive new status
        const newStatus = this.deriveStatus(newWeight, newAcceptCount, newRejectCount);

        // Update atomically
        await this.questionModel.updateOne(
            { _id: questionId },
            {
                $set: {
                    weight: newWeight,
                    accept_count: newAcceptCount,
                    reject_count: newRejectCount,
                    skip_count: newSkipCount,
                    vetting_status: newStatus,
                },
                $push: {
                    vetting_logs: {
                        user_id: userObjectId,
                        action,
                        reason,
                        created_at: new Date(),
                    },
                },
            },
        );

        return {
            success: true,
            weight: newWeight,
            vetting_status: newStatus,
            accept_count: newAcceptCount,
            reject_count: newRejectCount,
            skip_count: newSkipCount,
        };
    }

    /**
     * Get questions for vetting with optional filters
     */
    async getQuestionsForVetting(filters: VettingFilters, limit = 20, skip = 0) {
        const query: Record<string, unknown> = {};

        if (filters.vetting_status) {
            query.vetting_status = filters.vetting_status;
        }
        if (filters.course_code) {
            query.course_code = filters.course_code;
        }
        if (filters.topic) {
            query.topic = filters.topic;
        }
        if (filters.duplicate_warning !== undefined) {
            query.duplicate_warning = filters.duplicate_warning;
        }

        return this.questionModel
            .find(query)
            .select('-embedding -embedding_model') // Exclude embeddings
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();
    }

    /**
     * Calculate weight delta based on action and duplicate_warning
     */
    private calculateWeightDelta(action: VettingAction, duplicateWarning: boolean): number {
        switch (action) {
            case VettingAction.ACCEPT:
                return duplicateWarning ? 0.05 : 0.1;
            case VettingAction.REJECT:
                return duplicateWarning ? -0.3 : -0.2;
            case VettingAction.SKIP:
                return 0;
        }
    }

    /**
     * Derive vetting status from weight and counts
     * - Approved: weight >= 1.2 AND accept_count >= 2 AND reject_count < accept_count
     * - Rejected: weight <= 0.6
     * - Otherwise: Pending
     */
    private deriveStatus(
        weight: number,
        acceptCount: number,
        rejectCount: number,
    ): VettingStatus {
        if (weight >= 1.2 && acceptCount >= 2 && rejectCount < acceptCount) {
            return VettingStatus.APPROVED;
        }
        if (weight <= 0.6) {
            return VettingStatus.REJECTED;
        }
        return VettingStatus.PENDING;
    }

    private clamp(value: number, min: number, max: number): number {
        return Math.min(max, Math.max(min, value));
    }
}
