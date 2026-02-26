import { Controller, Get, Param, UseGuards, Req } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { MinRoleLevel } from '../auth/decorators/min-role-level.decorator';
import { AnalyticsService } from './services/analytics.service';
import { AnalyticsResponse } from './dto/analytics-response.dto';
import { TrendResponse, CourseAnalyticsResponse, FacultyDetailsResponse } from './dto/analytics-reports.dto';
import { VettingService } from './services/vetting.service';
import { UserVettingStatsResponse } from './dto/user-vetting.dto';

interface AuthenticatedRequest extends Request {
    user: { userId: string; roleId: string };
}

@Controller('analytics')
export class AnalyticsController {
    constructor(
        private readonly analyticsService: AnalyticsService,
        private readonly vettingService: VettingService,
    ) { }

    @Get('system')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @MinRoleLevel(2) // Teacher and above
    async getSystemAnalytics(): Promise<AnalyticsResponse> {
        return this.analyticsService.getSystemAnalytics();
    }

    @Get('user-vetting')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @MinRoleLevel(2)
    async getUserVettingStats(@Req() req: AuthenticatedRequest): Promise<UserVettingStatsResponse> {
        return this.vettingService.getUserVettingStats(req.user.userId);
    }

    @Get('trends')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @MinRoleLevel(2)
    async getTrends(): Promise<TrendResponse> {
        return this.analyticsService.getTrends();
    }

    @Get('course/:code')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @MinRoleLevel(2)
    async getCourseAnalytics(@Param('code') code: string): Promise<CourseAnalyticsResponse> {
        return this.analyticsService.getCourseAnalytics(code);
    }

    @Get('faculty/:id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @MinRoleLevel(2)
    async getFacultyDetails(@Param('id') id: string): Promise<FacultyDetailsResponse> {
        return this.analyticsService.getFacultyDetails(id);
    }
}
