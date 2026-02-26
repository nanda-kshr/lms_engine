import {
    Controller,
    Post,
    UseInterceptors,
    UploadedFile,
    Body,
    Req,
    UseGuards,
    Get,
    Delete,
    Param,
    BadRequestException,
    Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { MaterialsService } from './materials.service';
import { MaterialType } from '../schemas/material.schema';
import { Request } from 'express';

@Controller('materials')
@UseGuards(AuthGuard('jwt'))
export class MaterialsController {
    private readonly logger = new Logger(MaterialsController.name);

    constructor(private readonly materialsService: MaterialsService) { }

    @Post('upload')
    @UseInterceptors(FileInterceptor('file'))
    async uploadMaterial(
        @UploadedFile() file: Express.Multer.File,
        @Body('course_code') courseCode: string,
        @Body('type') type: MaterialType,
        @Req() req: any, // Typed as any because user is attached by passport
    ) {
        if (!file) {
            throw new BadRequestException('No file uploaded');
        }
        if (!courseCode) {
            throw new BadRequestException('Course code is required');
        }
        if (!type || !Object.values(MaterialType).includes(type)) {
            throw new BadRequestException('Valid material type (SYLLABUS or CONTENT) is required');
        }

        const userId = req.user.userId; // Assuming JWT strategy attaches user with userId

        return this.materialsService.uploadMaterial(file, courseCode, type, userId);
    }

    @Get('my-uploads')
    async getUserMaterials(@Req() req: any) {
        const userId = req.user.userId;
        return this.materialsService.getUserMaterials(userId);
    }

    @Delete(':id')
    async deleteMaterial(@Param('id') id: string, @Req() req: any) {
        const userId = req.user.userId;
        return this.materialsService.deleteMaterial(id, userId);
    }
}
