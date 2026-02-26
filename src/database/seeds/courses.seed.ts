import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Course, CourseDocument } from '../../schemas/course.schema';
import { Topic, TopicDocument } from '../../schemas/topic.schema';

interface CourseData {
    name: string;
    code: string;
    description: string;
    topics: string[];
}

const SEED_COURSES: CourseData[] = [
    {
        name: 'Data Structure and Algorithms',
        code: 'DSA',
        description: 'Fundamental data structures and algorithmic techniques',
        topics: [
            'Arrays and Strings',
            'Linked Lists',
            'Stacks and Queues',
            'Trees and Binary Search Trees',
            'Heaps and Priority Queues',
            'Graphs',
            'Hashing',
            'Sorting Algorithms',
            'Searching Algorithms',
            'Recursion and Backtracking',
        ],
    },
    {
        name: 'Design and Analysis of Algorithms',
        code: 'DAA',
        description: 'Algorithm design paradigms and complexity analysis',
        topics: [
            'Asymptotic Analysis',
            'Divide and Conquer',
            'Greedy Algorithms',
            'Dynamic Programming',
            'Graph Algorithms',
            'Minimum Spanning Trees',
            'Shortest Path Algorithms',
            'Network Flow',
            'NP-Completeness',
            'Approximation Algorithms',
        ],
    },
    {
        name: 'Database Management System',
        code: 'DBMS',
        description: 'Relational databases, SQL, and database design',
        topics: [
            'Introduction to DBMS',
            'ER Model and Diagrams',
            'Relational Model',
            'SQL Basics',
            'Advanced SQL',
            'Normalization',
            'Transactions and Concurrency',
            'Indexing and Hashing',
            'Query Processing',
            'NoSQL Databases',
        ],
    },
    {
        name: 'Java',
        code: 'JAVA',
        description: 'Object-oriented programming with Java',
        topics: [
            'Java Basics and Syntax',
            'Object-Oriented Programming',
            'Classes and Objects',
            'Inheritance and Polymorphism',
            'Interfaces and Abstract Classes',
            'Exception Handling',
            'Collections Framework',
            'Multithreading',
            'File I/O and Streams',
            'Java 8+ Features',
        ],
    },
    {
        name: 'Python',
        code: 'PYTHON',
        description: 'Python programming fundamentals and applications',
        topics: [
            'Python Basics and Syntax',
            'Data Types and Variables',
            'Control Flow',
            'Functions and Modules',
            'Object-Oriented Python',
            'File Handling',
            'Exception Handling',
            'List Comprehensions and Generators',
            'Libraries (NumPy, Pandas)',
            'Web Development Basics',
        ],
    },
];

@Injectable()
export class CoursesSeedService implements OnModuleInit {
    private readonly logger = new Logger(CoursesSeedService.name);

    constructor(
        @InjectModel(Course.name) private readonly courseModel: Model<CourseDocument>,
        @InjectModel(Topic.name) private readonly topicModel: Model<TopicDocument>,
    ) { }

    async onModuleInit() {
        await this.seedCourses();
    }

    private async seedCourses() {
        for (const courseData of SEED_COURSES) {
            let course = await this.courseModel.findOne({ code: courseData.code });

            if (!course) {
                course = await this.courseModel.create({
                    name: courseData.name,
                    code: courseData.code,
                    description: courseData.description,
                });
                this.logger.log(`Seeded course: ${courseData.name}`);
            }

            if (course) {
                // Seed topics for this course
                for (let i = 0; i < courseData.topics.length; i++) {
                    const topicName = courseData.topics[i];
                    const exists = await this.topicModel.findOne({
                        name: topicName,
                        course_id: course._id,
                    });

                    if (!exists) {
                        await this.topicModel.create({
                            name: topicName,
                            course_id: course._id,
                            description: `${topicName} description`,
                            order: i + 1,
                        });
                        this.logger.log(`  Seeded topic: ${topicName} for course ${course.code}`);
                    }
                }
            }
        }
    }
}
