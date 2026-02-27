import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Rubric, RubricSchema } from '../schemas/rubric.schema';
import { Role, RoleSchema } from '../schemas/role.schema';
import { RubricsService } from './rubrics.service';
import { RubricsController } from './rubrics.controller';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Rubric.name, schema: RubricSchema },
            { name: Role.name, schema: RoleSchema },
        ]),
    ],
    controllers: [RubricsController],
    providers: [RubricsService],
    exports: [RubricsService],
})
export class RubricsModule { }
