import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Role, RoleDocument } from '../../schemas/role.schema';

const SEED_ROLES = [
    {
        name: 'student',
        level: 1,
        features: {
            analytics_faculty_actions: false,
            analytics_faculty_correctness: false,
            upload_mcq: false,
            upload_essayquestions: false,
            upload_notes: false,
            generate_mcq: true,
            generate_essayquestions: true,
            generate_notes: true,
            vetting_mcq: false,
            vetting_essayquestions: false,
            vetting_notes: false,
        },
    },
    {
        name: 'teacher',
        level: 2,
        features: {
            analytics_faculty_actions: false,
            analytics_faculty_correctness: false,
            upload_mcq: true,
            upload_essayquestions: true,
            upload_notes: true,
            generate_mcq: true,
            generate_essayquestions: true,
            generate_notes: true,
            vetting_mcq: true,
            vetting_essayquestions: true,
            vetting_notes: true,
        },
    },
    {
        name: 'admin',
        level: 3,
        features: {
            analytics_faculty_actions: true,
            analytics_faculty_correctness: true,
            upload_mcq: true,
            upload_essayquestions: true,
            upload_notes: true,
            generate_mcq: true,
            generate_essayquestions: true,
            generate_notes: true,
            vetting_mcq: true,
            vetting_essayquestions: true,
            vetting_notes: true,
        },
    },
];

@Injectable()
export class RolesSeedService implements OnModuleInit {
    private readonly logger = new Logger(RolesSeedService.name);

    constructor(
        @InjectModel(Role.name) private readonly roleModel: Model<RoleDocument>,
    ) { }

    async onModuleInit() {
        await this.seedRoles();
    }

    private async seedRoles() {
        for (const roleData of SEED_ROLES) {
            const exists = await this.roleModel.findOne({ name: roleData.name });
            if (!exists) {
                await this.roleModel.create(roleData);
                this.logger.log(`Seeded role: ${roleData.name}`);
            }
        }
    }
}
