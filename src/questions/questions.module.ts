import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MulterModule } from '@nestjs/platform-express';
import { Question, QuestionSchema } from '../schemas/question.schema';
import { Role, RoleSchema } from '../schemas/role.schema';
import { Course, CourseSchema } from '../schemas/course.schema';
import { Topic, TopicSchema } from '../schemas/topic.schema';
import { User, UserSchema } from '../schemas/user.schema';
import { LlmModule } from '../llm';
import { QuestionsController } from './questions.controller';
import { AnalyticsController } from './analytics.controller';
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
import { GenerationService } from './services/generation.service';
import { AnalyticsService } from './services/analytics.service';
import { MaterialsModule } from '../materials/materials.module';
import { CoursesModule } from '../courses/courses.module';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Question.name, schema: QuestionSchema },
            { name: Role.name, schema: RoleSchema },
            { name: Course.name, schema: CourseSchema },
            { name: Topic.name, schema: TopicSchema },
            { name: User.name, schema: UserSchema },
        ]),
        MulterModule.register({
            limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
        }),
        LlmModule.forRoot(),
        forwardRef(() => MaterialsModule),
        CoursesModule,
    ],
    controllers: [QuestionsController, AnalyticsController],
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
        GenerationService,
        AnalyticsService,
    ],
    exports: [
        CsvParserService,
        RowValidatorService,
        NormalizerService,
        EmbeddingService,
    ],
})
export class QuestionsModule { }
