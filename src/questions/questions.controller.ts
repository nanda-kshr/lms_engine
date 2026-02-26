import {
    Controller,
    Post,
    Get,
    Param,
    Body,
    Query,
    UseGuards,
    UseInterceptors,
    UploadedFile,
    BadRequestException,
    Req,
    Res,
    Delete,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { MinRoleLevel } from '../auth/decorators/min-role-level.decorator';
import { Question, QuestionDocument, VettingStatus } from '../schemas/question.schema';
import { CsvTemplateType, TEMPLATE_HEADERS } from './templates/csv-templates';
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
import type { GenerationBlueprint } from './services/generation.service';
import { UploadResponseDto } from './dto/upload-response.dto';
import { VetQuestionDto } from './dto/vet-question.dto';

interface AuthenticatedRequest extends Request {
    user: { userId: string; roleId: string };
}

@Controller('questions')
export class QuestionsController {
    constructor(
        @InjectModel(Question.name)
        private readonly questionModel: Model<QuestionDocument>,
        private readonly csvParser: CsvParserService,
        private readonly templateDetector: TemplateDetectorService,
        private readonly headerValidator: HeaderValidatorService,
        private readonly rowValidator: RowValidatorService,
        private readonly normalizer: NormalizerService,
        private readonly courseValidator: CourseValidatorService,
        private readonly duplicateDetector: DuplicateDetectorService,
        private readonly semanticAnnotator: SemanticAnnotatorService,
        private readonly embeddingService: EmbeddingService,
        private readonly vettingService: VettingService,
        private readonly generationService: GenerationService,
    ) { }

    @Post('upload')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @MinRoleLevel(2) // Teacher and above
    @UseInterceptors(FileInterceptor('file'))
    async uploadQuestions(
        @UploadedFile() file: Express.Multer.File,
        @Req() req: AuthenticatedRequest,
    ): Promise<UploadResponseDto> {
        if (!file) {
            throw new BadRequestException('No file uploaded');
        }

        if (!file.originalname.toLowerCase().endsWith('.csv')) {
            throw new BadRequestException('Only CSV files are allowed');
        }

        const { headers, rows } = this.csvParser.parse(file.buffer);
        const templateType = this.templateDetector.detect(headers);
        this.headerValidator.validate(headers, templateType);

        const { valid: validRows, errors: rowErrors } = this.rowValidator.validate(
            rows,
            templateType,
        );

        const uploadContext = {
            upload_id: uuidv4(),
            uploaded_by: req.user.userId,
            uploaded_at: new Date(),
            default_course_code: req.body.course_code,
            default_topic: req.body.topic,
        };
        const normalizedQuestions = this.normalizer.normalize(
            validRows,
            templateType,
            uploadContext,
        );

        const { valid: courseValidQuestions, errors: courseErrors } =
            await this.courseValidator.validate(normalizedQuestions, 2);

        const allErrors = [...rowErrors, ...courseErrors];

        const questionsWithDuplicateFlags =
            await this.duplicateDetector.checkDuplicates(courseValidQuestions);

        let insertedIds: string[] = [];
        if (questionsWithDuplicateFlags.length > 0) {
            const toInsert = questionsWithDuplicateFlags.map((r) => r.question);
            const inserted = await this.questionModel.insertMany(toInsert);
            insertedIds = inserted.map((doc) => doc._id.toString());
        }

        if (insertedIds.length > 0) {
            this.triggerAsyncJobs(insertedIds);
        }

        const duplicateCount = questionsWithDuplicateFlags.filter(
            (r) => r.duplicate_warning,
        ).length;

        return {
            upload_id: uploadContext.upload_id,
            total_rows: rows.length,
            accepted_rows: questionsWithDuplicateFlags.length,
            rejected_rows: allErrors.length,
            duplicate_warnings: duplicateCount,
            errors: allErrors,
        };
    }

    @Get('my-uploads')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @MinRoleLevel(2)
    async getUserUploads(@Req() req: AuthenticatedRequest) {
        const userId = req.user.userId;
        const uploads = await this.questionModel.aggregate([
            {
                $match: {
                    uploaded_by: new Types.ObjectId(userId),
                },
            },
            {
                $group: {
                    _id: '$upload_id',
                    uploaded_at: { $first: '$uploaded_at' },
                    course_code: { $first: '$course_code' },
                    topic: { $first: '$topic' },
                    total_questions: { $sum: 1 },
                    approved_count: {
                        $sum: { $cond: [{ $eq: ['$vetting_status', 'approved'] }, 1, 0] },
                    },
                    rejected_count: {
                        $sum: { $cond: [{ $eq: ['$vetting_status', 'rejected'] }, 1, 0] },
                    },
                    pending_count: {
                        $sum: { $cond: [{ $eq: ['$vetting_status', 'pending'] }, 1, 0] },
                    },
                },
            },
            { $sort: { uploaded_at: -1 } },
            { $limit: 20 },
        ]);

        return uploads;
    }

    @Delete('upload/:uploadId')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @MinRoleLevel(2)
    async deleteUpload(@Param('uploadId') uploadId: string, @Req() req: AuthenticatedRequest) {
        const userId = req.user.userId;

        // Check if the upload exists and belongs to the user
        const questions = await this.questionModel.find({
            upload_id: uploadId,
            uploaded_by: new Types.ObjectId(userId),
        }).limit(1);

        if (questions.length === 0) {
            throw new BadRequestException('Upload not found or access denied');
        }

        const result = await this.questionModel.deleteMany({
            upload_id: uploadId,
            uploaded_by: new Types.ObjectId(userId),
        });

        return { deleted_count: result.deletedCount };
    }

    /**
     * Get questions for vetting with optional filters
     */
    @Get('vetting')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @MinRoleLevel(2) // Teacher and above
    async getQuestionsForVetting(
        @Req() req: AuthenticatedRequest,
        @Query('vetting_status') vettingStatus?: VettingStatus,
        @Query('course_code') courseCode?: string,
        @Query('topic') topic?: string,
        @Query('duplicate_warning') duplicateWarning?: string,
        @Query('limit') limit?: string,
        @Query('skip') skip?: string,
    ) {
        const filters = {
            vetting_status: vettingStatus,
            course_code: courseCode,
            topic,
            duplicate_warning:
                duplicateWarning === 'true'
                    ? true
                    : duplicateWarning === 'false'
                        ? false
                        : undefined,
        };

        return this.vettingService.getQuestionsForVetting(
            filters,
            req.user.userId,
            parseInt(limit || '10', 10),
            parseInt(skip || '0', 10),
        );
    }

    /**
     * Vet a question (accept/reject/skip)
     */
    @Post(':id/vet')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @MinRoleLevel(2) // Teacher and above
    async vetQuestion(
        @Param('id') id: string,
        @Body() dto: VetQuestionDto,
        @Req() req: AuthenticatedRequest,
    ) {
        if (!id || id.trim() === '') {
            throw new BadRequestException('Question ID is required');
        }
        return this.vettingService.vet(id, req.user.userId, dto.action, dto.reason);
    }

    private triggerAsyncJobs(questionIds: string[]): void {
        setImmediate(async () => {
            try {
                await this.semanticAnnotator.annotateQuestions(questionIds);
                await this.embeddingService.generateEmbeddings(questionIds);
            } catch (error) {
                console.error('Async job failed:', error);
            }
        });
    }

    // ── Question Paper Generation ──────────────────────
    @Post('generate')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @MinRoleLevel(2) // Teacher and above
    async generatePaper(
        @Body() blueprint: GenerationBlueprint,
        @Req() req: AuthenticatedRequest,
    ) {
        return this.generationService.generatePaper(blueprint, req.user.userId);
    }
}
