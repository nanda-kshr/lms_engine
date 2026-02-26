import { Controller, Get, Post, Put, Delete, Body, Param } from '@nestjs/common';
import { CoursesService } from './courses.service';
import { Course, CourseDocument } from '../schemas/course.schema';
import { Topic, TopicDocument } from '../schemas/topic.schema';

@Controller('courses')
export class CoursesController {
    constructor(private readonly coursesService: CoursesService) { }

    // ── Courses ─────────────────────────────────────────

    @Get()
    findAll() {
        return this.coursesService.findAll();
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.coursesService.findOne(id);
    }

    @Post()
    create(@Body() createCourseDto: { name: string; code: string; description?: string }) {
        return this.coursesService.create(createCourseDto);
    }

    @Put(':id')
    update(@Param('id') id: string, @Body() updateCourseDto: { name?: string; code?: string; description?: string }) {
        return this.coursesService.update(id, updateCourseDto);
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.coursesService.remove(id);
    }

    // ── Topics ──────────────────────────────────────────

    @Get(':courseId/topics')
    getTopics(@Param('courseId') courseId: string) {
        return this.coursesService.getTopics(courseId);
    }

    @Post(':courseId/topics')
    addTopic(@Param('courseId') courseId: string, @Body() createTopicDto: { name: string; description?: string }) {
        return this.coursesService.addTopic(courseId, createTopicDto);
    }

    @Put(':courseId/topics/:topicId')
    updateTopic(
        @Param('courseId') courseId: string,
        @Param('topicId') topicId: string,
        @Body() updateTopicDto: { name?: string; description?: string; order?: number }
    ) {
        return this.coursesService.updateTopic(topicId, updateTopicDto);
    }

    @Delete(':courseId/topics/:topicId')
    removeTopic(@Param('courseId') courseId: string, @Param('topicId') topicId: string) {
        return this.coursesService.removeTopic(topicId);
    }
}
