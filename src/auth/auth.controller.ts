import {
    Controller,
    Post,
    Get,
    Body,
    Res,
    Req,
    UseGuards,
    HttpCode,
    HttpStatus,
    ServiceUnavailableException,
} from '@nestjs/common';
import type { Response, Request } from 'express';
import { AuthService } from './auth.service';
import { SignupDto, SigninDto } from './dto/auth.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

const REFRESH_TOKEN_COOKIE = 'refresh_token';

@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) { }

    @Post('signup')
    async signup(@Body() dto: SignupDto) {
        return this.authService.signup(dto);
    }

    @Post('signin')
    @HttpCode(HttpStatus.OK)
    async signin(@Body() dto: SigninDto, @Res({ passthrough: true }) res: Response) {
        const { accessToken, refreshToken } = await this.authService.signin(dto);

        res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        });

        return { accessToken };
    }

    @Post('refresh')
    @HttpCode(HttpStatus.OK)
    async refresh(@Req() req: Request) {
        const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE];
        if (!refreshToken) {
            throw new ServiceUnavailableException('No refresh token provided');
        }
        return this.authService.refresh(refreshToken);
    }

    @Post('logout')
    @HttpCode(HttpStatus.OK)
    async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
        const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE];
        if (refreshToken) {
            await this.authService.logout(refreshToken);
        }

        res.clearCookie(REFRESH_TOKEN_COOKIE);
        return { message: 'Logged out successfully' };
    }

    @Get('me')
    @UseGuards(JwtAuthGuard)
    async me(@Req() req: Request) {
        const user = req.user as { userId: string };
        return this.authService.me(user.userId);
    }

    // Disabled endpoints - return 503
    @Post('forgot-password')
    forgotPassword() {
        throw new ServiceUnavailableException('Feature not implemented');
    }

    @Post('change-password')
    changePassword() {
        throw new ServiceUnavailableException('Feature not implemented');
    }

    @Post('verify-email')
    verifyEmail() {
        throw new ServiceUnavailableException('Feature not implemented');
    }

    @Post('resend-verification')
    resendVerification() {
        throw new ServiceUnavailableException('Feature not implemented');
    }
}
