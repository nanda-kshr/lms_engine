import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Course, CourseDocument } from '../../schemas/course.schema';
import { Topic, TopicDocument } from '../../schemas/topic.schema';
import type { NormalizedQuestion } from './normalizer.service';

export interface CourseValidationResult {
    valid: NormalizedQuestion[];
    errors: Array<{ row: number; reason: string }>;
}

@Injectable()
export class CourseValidatorService {
    constructor(
        @InjectModel(Course.name) private readonly courseModel: Model<CourseDocument>,
        @InjectModel(Topic.name) private readonly topicModel: Model<TopicDocument>,
    ) { }

    /**
     * Validate course_code and topic if provided.
     * - If course_code is provided, validate it exists
     * - If topic is provided, validate it belongs to that course
     * - If not provided, skip validation (no enforcement)
     */
    async validate(
        questions: NormalizedQuestion[],
        startRow: number = 2,
    ): Promise<CourseValidationResult> {
        const valid: NormalizedQuestion[] = [];
        const errors: Array<{ row: number; reason: string }> = [];

        // Cache course lookups
        const courseCache = new Map<string, CourseDocument | null>();
        const topicCache = new Map<string, boolean>();

        for (let i = 0; i < questions.length; i++) {
            const question = questions[i];
            const rowNumber = startRow + i;
            const rowErrors: string[] = [];

            if (question.course_code) {
                let course = courseCache.get(question.course_code);
                if (course === undefined) {
                    const foundCourse = await this.courseModel.findOne({ code: question.course_code });
                    course = foundCourse ?? null;
                    courseCache.set(question.course_code, course);
                }

                if (!course) {
                    rowErrors.push(`course_code '${question.course_code}' does not exist`);
                } else if (question.topic) {
                    // Validate topic belongs to course
                    const cacheKey = `${question.course_code}:${question.topic}`;
                    let topicExists = topicCache.get(cacheKey);

                    if (topicExists === undefined) {
                        const topic = await this.topicModel.findOne({
                            name: question.topic,
                            course_id: course._id,
                        });
                        topicExists = !!topic;
                        topicCache.set(cacheKey, topicExists);
                    }

                    if (!topicExists) {
                        rowErrors.push(
                            `topic '${question.topic}' does not belong to course '${question.course_code}'`,
                        );
                    }
                }
            } else if (question.topic) {
                // Topic provided without course_code
                rowErrors.push('topic provided without course_code');
            }

            if (rowErrors.length > 0) {
                errors.push({ row: rowNumber, reason: rowErrors.join('; ') });
            } else {
                valid.push(question);
            }
        }

        return { valid, errors };
    }
}
