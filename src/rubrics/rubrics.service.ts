import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Rubric, RubricDocument } from '../schemas/rubric.schema';

@Injectable()
export class RubricsService {
    private readonly logger = new Logger(RubricsService.name);

    constructor(
        @InjectModel(Rubric.name) private rubricModel: Model<RubricDocument>,
    ) { }

    async findAll(query: { search?: string; page?: number; limit?: number; userId?: string }) {
        const { search, page = 1, limit = 10, userId } = query;
        const filter: any = {};

        if (userId) filter.created_by = new Types.ObjectId(userId);
        if (search) filter.name = { $regex: search, $options: 'i' };

        const skip = (page - 1) * limit;
        const [data, total] = await Promise.all([
            this.rubricModel.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit).exec(),
            this.rubricModel.countDocuments(filter),
        ]);

        return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
    }

    async findOne(id: string): Promise<RubricDocument> {
        const rubric = await this.rubricModel.findById(id).exec();
        if (!rubric) throw new NotFoundException('Rubric not found');
        return rubric;
    }

    async create(dto: Partial<Rubric> & { created_by: string }): Promise<RubricDocument> {
        const rubric = new this.rubricModel({
            ...dto,
            created_by: new Types.ObjectId(dto.created_by),
        });
        const saved = await rubric.save();
        this.logger.log(`Rubric "${saved.name}" created (${saved._id})`);
        return saved;
    }

    async update(id: string, dto: Partial<Rubric>): Promise<RubricDocument> {
        const rubric = await this.rubricModel.findByIdAndUpdate(id, dto, { new: true }).exec();
        if (!rubric) throw new NotFoundException('Rubric not found');
        this.logger.log(`Rubric "${rubric.name}" updated (${rubric._id})`);
        return rubric;
    }

    async remove(id: string): Promise<void> {
        const result = await this.rubricModel.findByIdAndDelete(id).exec();
        if (!result) throw new NotFoundException('Rubric not found');
        this.logger.log(`Rubric ${id} deleted`);
    }
}
