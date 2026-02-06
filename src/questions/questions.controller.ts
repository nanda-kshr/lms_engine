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
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { MinRoleLevel } from '../auth/decorators/min-role-level.decorator';
import { Question, QuestionDocument, VettingStatus } from '../schemas/question.schema';
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

    /**
     * Get questions for vetting with optional filters
     */
    @Get('vetting')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @MinRoleLevel(2) // Teacher and above
    async getQuestionsForVetting(
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
            parseInt(limit || '20', 10),
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
}
