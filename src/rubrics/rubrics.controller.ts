import { Controller, Get, Post, Put, Delete, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { MinRoleLevel } from '../auth/decorators/min-role-level.decorator';
import { RubricsService } from './rubrics.service';

interface AuthenticatedRequest extends Request {
    user: { userId: string; roleId: string };
}

@Controller('rubrics')
@UseGuards(JwtAuthGuard, RolesGuard)
@MinRoleLevel(2)
export class RubricsController {
    constructor(private readonly rubricsService: RubricsService) { }

    @Get()
    findAll(
        @Req() req: AuthenticatedRequest,
        @Query('search') search?: string,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        return this.rubricsService.findAll({
            search,
            page: page ? parseInt(page, 10) : 1,
            limit: limit ? parseInt(limit, 10) : 10,
            userId: req.user.userId,
        });
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.rubricsService.findOne(id);
    }

    @Post()
    create(@Body() body: any, @Req() req: AuthenticatedRequest) {
        return this.rubricsService.create({ ...body, created_by: req.user.userId });
    }

    @Put(':id')
    update(@Param('id') id: string, @Body() body: any) {
        return this.rubricsService.update(id, body);
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.rubricsService.remove(id);
    }
}
