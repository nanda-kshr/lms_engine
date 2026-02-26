import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Question, QuestionDocument, VettingStatus } from '../../schemas/question.schema';
import { User, UserDocument } from '../../schemas/user.schema';
import { AnalyticsResponse, FacultyStat } from '../dto/analytics-response.dto';
import { TrendResponse, CourseAnalyticsResponse, FacultyDetailsResponse } from '../dto/analytics-reports.dto';

@Injectable()
export class AnalyticsService {
    private readonly logger = new Logger(AnalyticsService.name);

    constructor(
        @InjectModel(Question.name)
        private readonly questionModel: Model<QuestionDocument>,
        @InjectModel(User.name)
        private readonly userModel: Model<UserDocument>,
    ) { }

    async getSystemAnalytics(): Promise<AnalyticsResponse> {
        this.logger.log('Fetching system analytics...');

        // 1. Overview Aggregation
        const overviewData = await this.questionModel.aggregate([
            {
                $facet: {
                    counts: [
                        {
                            $group: {
                                _id: '$vetting_status',
                                count: { $sum: 1 },
                            },
                        },
                    ],
                    ai_counts: [
                        { $match: { source: 'AI' } },
                        { $count: 'count' },
                    ],
                },
            },
        ]);

        const counts = (overviewData[0].counts as { _id: string; count: number }[]).reduce(
            (acc, curr) => ({ ...acc, [curr._id]: curr.count }),
            {} as Record<string, number>,
        );

        const total = Object.values(counts).reduce((a, b) => a + b, 0);
        const approved = counts['approved'] || 0;
        const pending = counts['pending'] || 0;
        const rejected = counts['rejected'] || 0;
        const ai_generated = overviewData[0].ai_counts[0]?.count || 0;

        // 2. Content Health
        const contentData = await this.questionModel.aggregate([
            { $match: { vetting_status: VettingStatus.APPROVED } },
            {
                $facet: {
                    by_difficulty: [
                        { $group: { _id: '$difficulty', count: { $sum: 1 } } },
                    ],
                    by_co: [
                        // Map CO_map keys that are 1
                        {
                            $project: {
                                cos: {
                                    $filter: {
                                        input: [
                                            { k: 'CO1', v: '$CO_map.CO1' },
                                            { k: 'CO2', v: '$CO_map.CO2' },
                                            { k: 'CO3', v: '$CO_map.CO3' },
                                            { k: 'CO4', v: '$CO_map.CO4' },
                                            { k: 'CO5', v: '$CO_map.CO5' },
                                        ],
                                        as: 'item',
                                        cond: { $gt: ['$$item.v', 0] },
                                    },
                                },
                            },
                        },
                        { $unwind: '$cos' },
                        { $group: { _id: '$cos.k', count: { $sum: 1 } } },
                    ],
                },
            },
        ]);

        const coDist = (contentData[0].by_co as { _id: string; count: number }[]).reduce(
            (acc, curr) => ({ ...acc, [curr._id]: curr.count }),
            {} as Record<string, number>,
        );

        const diffDist = (contentData[0].by_difficulty as { _id: string; count: number }[]).reduce(
            (acc, curr) => ({ ...acc, [curr._id]: curr.count }),
            {} as Record<string, number>,
        );

        // 3. Faculty Activity
        const facultyData = await this.questionModel.aggregate([
            {
                $group: {
                    _id: '$uploaded_by',
                    uploads: { $sum: 1 },
                    approved: { $sum: { $cond: [{ $eq: ['$vetting_status', VettingStatus.APPROVED] }, 1, 0] } },
                    rejected: { $sum: { $cond: [{ $eq: ['$vetting_status', VettingStatus.REJECTED] }, 1, 0] } },
                },
            },
            {
                $lookup: {
                    from: 'users',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'user',
                },
            },
            { $unwind: '$user' },
            {
                $project: {
                    userId: '$_id',
                    name: '$user.name',
                    uploads: 1,
                    approved: 1,
                    rejected: 1,
                },
            },
        ]);

        const totalActiveFaculty = await this.userModel.countDocuments({ status: 'ACTIVE' });

        return {
            overview: {
                total_questions: total,
                approved_questions: approved,
                pending_questions: pending,
                rejected_questions: rejected,
                ai_generated_questions: ai_generated,
                approval_rate: total > 0 ? (approved / total) * 100 : 0,
            },
            content: {
                by_co: coDist,
                by_difficulty: diffDist,
            },
            faculty: facultyData as FacultyStat[],
            active_faculty: totalActiveFaculty,
        };
    }

    async getTrends(): Promise<TrendResponse> {
        this.logger.log('Fetching trends...');
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const trends = await this.questionModel.aggregate([
            { $match: { uploaded_at: { $gte: thirtyDaysAgo } } },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$uploaded_at', timezone: 'Asia/Kolkata' } },
                    uploaded: { $sum: 1 },
                    approved: { $sum: { $cond: [{ $eq: ['$vetting_status', VettingStatus.APPROVED] }, 1, 0] } },
                },
            },
            { $sort: { _id: 1 } },
            {
                $project: {
                    date: '$_id',
                    uploaded: 1,
                    approved: 1,
                    _id: 0,
                },
            },
        ]);

        return { trends };
    }

    async getCourseAnalytics(courseCode: string): Promise<CourseAnalyticsResponse> {
        this.logger.log(`Fetching analytics for course: ${courseCode}`);

        const data = await this.questionModel.aggregate([
            { $match: { course_code: courseCode } },
            {
                $facet: {
                    overview: [
                        {
                            $group: {
                                _id: '$vetting_status',
                                count: { $sum: 1 },
                            },
                        },
                    ],
                    by_difficulty: [
                        { $match: { vetting_status: VettingStatus.APPROVED } },
                        { $group: { _id: '$difficulty', count: { $sum: 1 } } },
                    ],
                    by_co: [
                        { $match: { vetting_status: VettingStatus.APPROVED } },
                        {
                            $project: {
                                cos: {
                                    $filter: {
                                        input: [
                                            { k: 'CO1', v: '$CO_map.CO1' },
                                            { k: 'CO2', v: '$CO_map.CO2' },
                                            { k: 'CO3', v: '$CO_map.CO3' },
                                            { k: 'CO4', v: '$CO_map.CO4' },
                                            { k: 'CO5', v: '$CO_map.CO5' },
                                        ],
                                        as: 'item',
                                        cond: { $gt: ['$$item.v', 0] },
                                    },
                                },
                            },
                        },
                        { $unwind: '$cos' },
                        { $group: { _id: '$cos.k', count: { $sum: 1 } } },
                    ],
                },
            },
        ]);

        const counts = (data[0].overview as { _id: string; count: number }[]).reduce(
            (acc, curr) => ({ ...acc, [curr._id]: curr.count }),
            {} as Record<string, number>,
        );

        const total = Object.values(counts).reduce((a, b) => a + b, 0);
        const approved = counts['approved'] || 0;

        const coDist = (data[0].by_co as { _id: string; count: number }[]).reduce(
            (acc, curr) => ({ ...acc, [curr._id]: curr.count }),
            {} as Record<string, number>,
        );

        const diffDist = (data[0].by_difficulty as { _id: string; count: number }[]).reduce(
            (acc, curr) => ({ ...acc, [curr._id]: curr.count }),
            {} as Record<string, number>,
        );

        return {
            course_code: courseCode,
            total_questions: total,
            approved_questions: approved,
            by_co: coDist,
            by_difficulty: diffDist,
            approval_rate: total > 0 ? (approved / total) * 100 : 0,
        };
    }

    async getFacultyDetails(facultyId: string): Promise<FacultyDetailsResponse> {
        this.logger.log(`Fetching faculty detailed stats: ${facultyId}`);
        const user = await this.userModel.findById(facultyId);
        if (!user) {
            throw new Error('User not found');
        }

        const monthlyStats = await this.questionModel.aggregate([
            { $match: { uploaded_by: new Types.ObjectId(facultyId) } },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m', date: '$uploaded_at', timezone: 'Asia/Kolkata' } },
                    uploads: { $sum: 1 },
                    approved: { $sum: { $cond: [{ $eq: ['$vetting_status', VettingStatus.APPROVED] }, 1, 0] } },
                    rejected: { $sum: { $cond: [{ $eq: ['$vetting_status', VettingStatus.REJECTED] }, 1, 0] } },
                },
            },
            { $sort: { _id: -1 } },
            {
                $project: {
                    month: '$_id',
                    uploads: 1,
                    approved: 1,
                    rejected: 1,
                    _id: 0,
                },
            },
        ]);

        const totalUploads = monthlyStats.reduce((a, b) => a + b.uploads, 0);
        const totalApproved = monthlyStats.reduce((a, b) => a + b.approved, 0);

        return {
            faculty_id: facultyId,
            name: user.name,
            total_uploads: totalUploads,
            lifetime_approval_rate: totalUploads > 0 ? (totalApproved / totalUploads) * 100 : 0,
            monthly_stats: monthlyStats,
        };
    }
}
