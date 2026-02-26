import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { LlmModule } from './llm';
import { QuestionsModule } from './questions';
import { RolesSeedService } from './database/seeds/roles.seed';
import { CoursesSeedService } from './database/seeds/courses.seed';
import { Role, RoleSchema } from './schemas/role.schema';
import { Course, CourseSchema } from './schemas/course.schema';
import { Topic, TopicSchema } from './schemas/topic.schema';
import { CoursesModule } from './courses/courses.module';
import { MaterialsModule } from './materials/materials.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    HealthModule,
    AuthModule,
    LlmModule.forRoot(),
    QuestionsModule,
    CoursesModule,
    MaterialsModule,
    MongooseModule.forFeature([
      { name: Role.name, schema: RoleSchema },
      { name: Course.name, schema: CourseSchema },
      { name: Topic.name, schema: TopicSchema },
    ]),
  ],
  controllers: [AppController],
  providers: [AppService, RolesSeedService, CoursesSeedService],
})
export class AppModule { }
