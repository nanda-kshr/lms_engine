import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Course, CourseDocument } from '../../schemas/course.schema';
import { Topic, TopicDocument } from '../../schemas/topic.schema';
import type { NormalizedQuestion } from './normalizer.service';

export interface CourseValidationError {
    row: number;
    reason: string;
}

export interface CourseValidationResult {
    valid: NormalizedQuestion[];
    errors: CourseValidationError[];
}

@Injectable()
export class CourseValidatorService {
    private readonly logger = new Logger(CourseValidatorService.name);

    constructor(
        @InjectModel(Course.name)
        private readonly courseModel: Model<CourseDocument>,
        @InjectModel(Topic.name)
        private readonly topicModel: Model<TopicDocument>,
    ) { }

    /**
     * Validates course_code and topic if provided.
     * Questions without course/topic pass through unchanged.
     * Questions with invalid course/topic are rejected.
     */
    async validate(
        questions: NormalizedQuestion[],
        startRow: number = 2,
    ): Promise<CourseValidationResult> {
        const valid: NormalizedQuestion[] = [];
        const errors: CourseValidationError[] = [];

        // Pre-fetch all courses and topics for efficiency
        const courses = await this.courseModel.find().lean();
        const courseMap = new Map(courses.map((c) => [c.code, c]));

        const topics = await this.topicModel.find().lean();
        const topicsByCourse = new Map<string, Set<string>>();
        for (const topic of topics) {
            const course = courses.find((c) => c._id.equals(topic.course_id));
            if (course) {
                if (!topicsByCourse.has(course.code)) {
                    topicsByCourse.set(course.code, new Set());
                }
                topicsByCourse.get(course.code)!.add(topic.name);
            }
        }

        for (let i = 0; i < questions.length; i++) {
            const question = questions[i];
            const rowNumber = startRow + i;
            const rowErrors: string[] = [];

            // Only validate if course_code is provided
            if (question.course_code) {
                if (!courseMap.has(question.course_code)) {
                    rowErrors.push(`course_code '${question.course_code}' does not exist`);
                } else if (question.topic) {
                    // If topic is provided, validate it belongs to the course
                    const courseTopics = topicsByCourse.get(question.course_code);
                    if (!courseTopics || !courseTopics.has(question.topic)) {
                        rowErrors.push(
                            `topic '${question.topic}' does not belong to course '${question.course_code}'`,
                        );
                    }
                }
            } else if (question.topic) {
                // Topic provided without course_code - warn but allow
                this.logger.warn(
                    `Row ${rowNumber}: topic provided without course_code, ignoring topic`,
                );
                question.topic = undefined;
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
