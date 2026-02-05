import {
    Controller,
    Post,
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
import { Question, QuestionDocument } from '../schemas/question.schema';
import { CsvParserService } from './services/csv-parser.service';
import { TemplateDetectorService } from './services/template-detector.service';
import { HeaderValidatorService } from './services/header-validator.service';
import { RowValidatorService } from './services/row-validator.service';
import { NormalizerService } from './services/normalizer.service';
import { DuplicateDetectorService } from './services/duplicate-detector.service';
import { SemanticAnnotatorService } from './services/semantic-annotator.service';
import { EmbeddingService } from './services/embedding.service';
import { UploadResponseDto } from './dto/upload-response.dto';

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
        private readonly duplicateDetector: DuplicateDetectorService,
        private readonly semanticAnnotator: SemanticAnnotatorService,
        private readonly embeddingService: EmbeddingService,
    ) { }

    @Post('upload')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @MinRoleLevel(2) // Teacher and above
    @UseInterceptors(FileInterceptor('file'))
    async uploadQuestions(
        @UploadedFile() file: Express.Multer.File,
        @Req() req: AuthenticatedRequest,
    ): Promise<UploadResponseDto> {
        // Validate file exists
        if (!file) {
            throw new BadRequestException('No file uploaded');
        }

        // Validate file type
        if (!file.originalname.toLowerCase().endsWith('.csv')) {
            throw new BadRequestException('Only CSV files are allowed');
        }

        // Step 1: Parse CSV
        const { headers, rows } = this.csvParser.parse(file.buffer);

        // Step 2: Detect template type
        const templateType = this.templateDetector.detect(headers);

        // Step 3: Validate headers (throws on failure - entire upload fails)
        this.headerValidator.validate(headers, templateType);

        // Step 4: Validate rows (partial success)
        const { valid, errors } = this.rowValidator.validate(rows, templateType);

        // Step 5: Normalize valid rows with upload context
        const uploadContext = {
            upload_id: uuidv4(),
            uploaded_by: req.user.userId,
            uploaded_at: new Date(),
        };
        const normalizedQuestions = this.normalizer.normalize(
            valid,
            templateType,
            uploadContext,
        );

        // Step 6: Check for duplicates (warn only - still inserts)
        const questionsWithDuplicateFlags = await this.duplicateDetector.checkDuplicates(
            normalizedQuestions,
        );

        // Step 7: Insert to MongoDB
        let insertedIds: string[] = [];
        if (questionsWithDuplicateFlags.length > 0) {
            const toInsert = questionsWithDuplicateFlags.map((r) => r.question);
            const inserted = await this.questionModel.insertMany(toInsert);
            insertedIds = inserted.map((doc) => doc._id.toString());
        }

        // Step 8: Trigger async jobs (non-blocking)
        if (insertedIds.length > 0) {
            this.triggerAsyncJobs(insertedIds);
        }

        // Count duplicates for response
        const duplicateCount = questionsWithDuplicateFlags.filter(
            (r) => r.duplicate_warning,
        ).length;

        // Step 9: Return response
        return {
            upload_id: uploadContext.upload_id,
            total_rows: rows.length,
            accepted_rows: valid.length,
            rejected_rows: errors.length,
            duplicate_warnings: duplicateCount,
            errors,
        };
    }

    private triggerAsyncJobs(questionIds: string[]): void {
        // Fire and forget - don't await
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
