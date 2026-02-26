import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Course, CourseDocument } from '../schemas/course.schema';
import { Topic, TopicDocument } from '../schemas/topic.schema';

@Injectable()
export class CoursesService {
    constructor(
        @InjectModel(Course.name) private courseModel: Model<CourseDocument>,
        @InjectModel(Topic.name) private topicModel: Model<TopicDocument>,
    ) { }

    // ── Courses ─────────────────────────────────────────

    async findAll(): Promise<CourseDocument[]> {
        return this.courseModel.find().sort({ name: 1 }).exec();
    }

    async findOne(id: string): Promise<CourseDocument> {
        const course = await this.courseModel.findById(id).exec();
        if (!course) {
            throw new NotFoundException(`Course with ID ${id} not found`);
        }
        return course;
    }

    async create(createCourseDto: { name: string; code: string; description?: string }): Promise<CourseDocument> {
        const existing = await this.courseModel.findOne({
            $or: [{ code: createCourseDto.code }, { name: createCourseDto.name }]
        });
        if (existing) {
            throw new BadRequestException('Course with this code or name already exists');
        }
        const createdCourse = new this.courseModel(createCourseDto);
        return createdCourse.save();
    }

    async update(id: string, updateCourseDto: { name?: string; code?: string; description?: string }): Promise<CourseDocument> {
        const course = await this.courseModel.findByIdAndUpdate(id, updateCourseDto, { new: true }).exec();
        if (!course) {
            throw new NotFoundException(`Course with ID ${id} not found`);
        }
        return course;
    }

    async remove(id: string): Promise<void> {
        const result = await this.courseModel.findByIdAndDelete(id).exec();
        if (!result) {
            throw new NotFoundException(`Course with ID ${id} not found`);
        }
        // Cascade delete topics
        await this.topicModel.deleteMany({ course_id: new Types.ObjectId(id) }).exec();
    }

    // ── Topics ──────────────────────────────────────────

    async getTopics(courseIdOrCode: string): Promise<TopicDocument[]> {
        let courseId: Types.ObjectId;

        if (Types.ObjectId.isValid(courseIdOrCode)) {
            courseId = new Types.ObjectId(courseIdOrCode);
        } else {
            // It might be a course code (e.g., "CS101")
            const course = await this.courseModel.findOne({ code: courseIdOrCode }).select('_id').exec();
            if (!course) {
                // If we can't find it by code, and it wasn't a valid ID, then it's not found
                // We return empty array to avoid breaking UI, or could throw NotFound
                return [];
            }
            courseId = course._id as Types.ObjectId;
        }

        const topics = await this.topicModel.find({ course_id: courseId }).sort({ order: 1 }).exec();
        return topics;
    }

    async addTopic(courseId: string, createTopicDto: { name: string; description?: string }): Promise<TopicDocument> {
        const course = await this.courseModel.findById(courseId);
        if (!course) {
            throw new NotFoundException(`Course with ID ${courseId} not found`);
        }

        // Get max order to append
        const lastTopic = await this.topicModel.findOne({ course_id: new Types.ObjectId(courseId) }).sort({ order: -1 }).exec();
        const order = lastTopic ? lastTopic.order + 1 : 1;

        const topic = new this.topicModel({
            ...createTopicDto,
            course_id: new Types.ObjectId(courseId),
            order,
        });
        return topic.save();
    }

    async updateTopic(topicId: string, updateTopicDto: { name?: string; description?: string; order?: number }): Promise<TopicDocument> {
        const topic = await this.topicModel.findByIdAndUpdate(topicId, updateTopicDto, { new: true }).exec();
        if (!topic) {
            throw new NotFoundException(`Topic with ID ${topicId} not found`);
        }
        return topic;
    }

    async removeTopic(topicId: string): Promise<void> {
        const result = await this.topicModel.findByIdAndDelete(topicId).exec();
        if (!result) {
            throw new NotFoundException(`Topic with ID ${topicId} not found`);
        }
    }
}
