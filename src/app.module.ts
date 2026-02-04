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
import { Role, RoleSchema } from './schemas/role.schema';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    HealthModule,
    AuthModule,
    LlmModule.forRoot(),
    QuestionsModule,
    MongooseModule.forFeature([{ name: Role.name, schema: RoleSchema }]),
  ],
  controllers: [AppController],
  providers: [AppService, RolesSeedService],
})
export class AppModule { }
