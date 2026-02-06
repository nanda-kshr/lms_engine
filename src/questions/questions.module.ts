import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MulterModule } from '@nestjs/platform-express';
import { Question, QuestionSchema } from '../schemas/question.schema';
import { Role, RoleSchema } from '../schemas/role.schema';
import { Course, CourseSchema } from '../schemas/course.schema';
import { Topic, TopicSchema } from '../schemas/topic.schema';
import { LlmModule } from '../llm';
import { QuestionsController } from './questions.controller';
import { CsvParserService } from './services/csv-parser.service';
import { TemplateDetectorService } from './services/template-detector.service';
import { HeaderValidatorService } from './services/header-validator.service';
import { RowValidatorService } from './services/row-validator.service';
import { NormalizerService } from './services/normalizer.service';
import { CourseValidatorService } from './services/course-validator.service';
import { DuplicateDetectorService } from './services/duplicate-detector.service';
import { SemanticAnnotatorService } from './services/semantic-annotator.service';
import { EmbeddingService } from './services/embedding.service';
import { VettingService } from './services/vetting.service';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Question.name, schema: QuestionSchema },
            { name: Role.name, schema: RoleSchema },
            { name: Course.name, schema: CourseSchema },
            { name: Topic.name, schema: TopicSchema },
        ]),
        MulterModule.register({
            limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
        }),
        LlmModule.forRoot(),
    ],
    controllers: [QuestionsController],
    providers: [
        CsvParserService,
        TemplateDetectorService,
        HeaderValidatorService,
        RowValidatorService,
        NormalizerService,
        CourseValidatorService,
        DuplicateDetectorService,
        SemanticAnnotatorService,
        EmbeddingService,
        VettingService,
    ],
    exports: [
        CsvParserService,
        RowValidatorService,
        NormalizerService,
    ],
})
export class QuestionsModule { }
