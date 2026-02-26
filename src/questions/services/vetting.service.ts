import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
    Question,
    QuestionDocument,
    VettingAction,
    VettingStatus,
} from '../../schemas/question.schema';
import { User, UserDocument } from '../../schemas/user.schema';

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
        @InjectModel(User.name)
        private readonly userModel: Model<UserDocument>,
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

        // 1. Check User Daily Limit
        const user = await this.userModel.findById(userId);
        if (!user) {
            throw new NotFoundException('User not found');
        }

        const now = new Date();
        const lastVetted = user.last_vetted_at ? new Date(user.last_vetted_at) : null;

        // Check if same day (local/server time)
        const isSameDay = lastVetted &&
            lastVetted.getDate() === now.getDate() &&
            lastVetted.getMonth() === now.getMonth() &&
            lastVetted.getFullYear() === now.getFullYear();

        if (!isSameDay) {
            user.daily_vetted_count = 0;
        }

        if (user.daily_vetted_count >= 50) {
            throw new BadRequestException('Daily vetting limit reached (50 questions/day)');
        }

        // 2. Find question AND check user hasn't already vetted (atomic)
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

        // 3. Update User Stats
        user.daily_vetted_count += 1;
        user.last_vetted_at = now;
        await user.save();

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
     * Get questions for vetting with daily limit enforcement.
     * Returns: questions user already vetted today + new unvetted ones (total capped at limit).
     */
    async getQuestionsForVetting(
        filters: VettingFilters,
        userId: string,
        limit = 50,
        skip = 0,
    ) {
        const userObjectId = new Types.ObjectId(userId);

        // For approved/rejected: show questions the user personally voted on
        if (filters.vetting_status && filters.vetting_status !== VettingStatus.PENDING) {
            // Map tab status to vetting action
            const actionFilter = filters.vetting_status === VettingStatus.APPROVED
                ? VettingAction.ACCEPT
                : VettingAction.REJECT;

            const query: Record<string, unknown> = {
                'vetting_logs': {
                    $elemMatch: {
                        user_id: userObjectId,
                        action: actionFilter,
                    },
                },
            };
            if (filters.course_code) query.course_code = filters.course_code;
            if (filters.topic) query.topic = filters.topic;

            const questions = await this.questionModel
                .find(query)
                .select('-embedding -embedding_model')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean();

            return {
                vetted_today: 0,
                remaining_votes: 0,
                daily_limit: limit,
                questions,
            };
        }

        // 1. Get start of today (UTC)
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        // 2. Find questions user already vetted today
        const alreadyVettedToday = await this.questionModel
            .find({
                'vetting_logs': {
                    $elemMatch: {
                        user_id: userObjectId,
                        created_at: { $gte: todayStart },
                    },
                },
                ...(filters.vetting_status && { vetting_status: filters.vetting_status }),
                ...(filters.course_code && { course_code: filters.course_code }),
                ...(filters.topic && { topic: filters.topic }),
            })
            .select('-embedding -embedding_model')
            .sort({ createdAt: -1 })
            .lean();

        const vettedCount = alreadyVettedToday.length;
        const remainingSlots = Math.max(0, limit - vettedCount);

        // 3. Fetch new unvetted questions (ones the user hasn't voted on yet)
        let newQuestions: any[] = [];
        if (remainingSlots > 0) {
            const query: Record<string, unknown> = {
                'vetting_logs.user_id': { $ne: userObjectId }, // exclude already vetted
            };

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

            newQuestions = await this.questionModel
                .find(query)
                .select('-embedding -embedding_model')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(remainingSlots)
                .lean();
        }

        return {
            vetted_today: vettedCount,
            remaining_votes: remainingSlots,
            daily_limit: limit,
            questions: newQuestions,
        };
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
    async getUserVettingStats(userId: string): Promise<any> {
        const user = await this.userModel.findById(userId);
        if (!user) {
            throw new NotFoundException('User not found');
        }

        const approvedCount = await this.questionModel.countDocuments({
            'vetting_logs': {
                $elemMatch: {
                    user_id: new Types.ObjectId(userId),
                    action: VettingAction.ACCEPT,
                },
            },
        });

        const rejectedCount = await this.questionModel.countDocuments({
            'vetting_logs': {
                $elemMatch: {
                    user_id: new Types.ObjectId(userId),
                    action: VettingAction.REJECT,
                },
            },
        });

        // Calculate days active
        // @ts-ignore - createdAt existing from timestamps: true
        let createdAt = user.createdAt ? new Date(user.createdAt) : new Date();
        if (isNaN(createdAt.getTime())) {
            createdAt = new Date();
        }

        const now = new Date();
        const diffTime = Math.abs(now.getTime() - createdAt.getTime());
        const daysActive = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        const dailyTarget = 50;
        const totalExpected = daysActive * dailyTarget;
        const totalVetted = approvedCount + rejectedCount;

        // Incompletions shouldn't be negative if they over-achieved
        const incompletions = Math.max(0, totalExpected - totalVetted);

        return {
            approved: approvedCount,
            rejected: rejectedCount,
            incompletions,
        };
    }
}
