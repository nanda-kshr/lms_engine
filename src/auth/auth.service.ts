import {
    Injectable,
    UnauthorizedException,
    ConflictException,
    NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';

import { User, UserDocument } from '../schemas/user.schema';
import { Role, RoleDocument } from '../schemas/role.schema';
import {
    RefreshToken,
    RefreshTokenDocument,
} from '../schemas/refresh-token.schema';
import { SignupDto, SigninDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
    constructor(
        @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
        @InjectModel(Role.name) private readonly roleModel: Model<RoleDocument>,
        @InjectModel(RefreshToken.name)
        private readonly refreshTokenModel: Model<RefreshTokenDocument>,
        private readonly jwtService: JwtService,
        private readonly configService: ConfigService,
    ) { }

    async signup(dto: SignupDto) {
        // Check if user exists
        const existingUser = await this.userModel.findOne({ email: dto.email });
        if (existingUser) {
            throw new ConflictException('Email already registered');
        }

        // Get lowest level role (student)
        const defaultRole = await this.roleModel.findOne().sort({ level: 1 });
        if (!defaultRole) {
            throw new Error('No roles found. Please seed roles first.');
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(dto.password, 10);

        // Create user
        const user = await this.userModel.create({
            email: dto.email,
            hashed_password: hashedPassword,
            name: dto.name,
            role_id: defaultRole._id,
        });

        return {
            id: user._id,
            email: user.email,
            name: user.name,
        };
    }

    async signin(dto: SigninDto) {
        const user = await this.userModel.findOne({ email: dto.email });
        if (!user) {
            throw new UnauthorizedException('Invalid credentials');
        }

        if (user.status === 'DISABLED') {
            throw new UnauthorizedException('Account is disabled');
        }

        const isPasswordValid = await bcrypt.compare(
            dto.password,
            user.hashed_password,
        );
        if (!isPasswordValid) {
            throw new UnauthorizedException('Invalid credentials');
        }

        const accessToken = this.generateAccessToken(
            user._id as Types.ObjectId,
            user.role_id,
        );
        const refreshToken = await this.generateRefreshToken(
            user._id as Types.ObjectId,
        );

        return { accessToken, refreshToken };
    }

    async refresh(refreshTokenValue: string) {
        const tokenDoc = await this.refreshTokenModel.findOne({
            token: refreshTokenValue,
            revoked: false,
        });

        if (!tokenDoc || tokenDoc.expires_at < new Date()) {
            throw new UnauthorizedException('Invalid or expired refresh token');
        }

        const user = await this.userModel.findById(tokenDoc.user_id);
        if (!user || user.status === 'DISABLED') {
            throw new UnauthorizedException('User not found or disabled');
        }

        const accessToken = this.generateAccessToken(
            user._id as Types.ObjectId,
            user.role_id,
        );

        return { accessToken };
    }

    async logout(refreshTokenValue: string) {
        await this.refreshTokenModel.updateOne(
            { token: refreshTokenValue },
            { revoked: true },
        );
    }

    async me(userId: string) {
        const user = await this.userModel.findById(userId);
        if (!user) {
            throw new NotFoundException('User not found');
        }

        const role = await this.roleModel.findById(user.role_id);
        if (!role) {
            throw new NotFoundException('Role not found');
        }

        return {
            id: user._id,
            email: user.email,
            name: user.name,
            role: role.name,
            features: role.features,
        };
    }

    private generateAccessToken(userId: Types.ObjectId, roleId: Types.ObjectId) {
        return this.jwtService.sign(
            { userId: userId.toString(), roleId: roleId.toString() },
            {
                secret: this.configService.get<string>('JWT_SECRET'),
                expiresIn: '7h',
            },
        );
    }

    private async generateRefreshToken(userId: Types.ObjectId): Promise<string> {
        const token = randomBytes(64).toString('hex');
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

        await this.refreshTokenModel.create({
            token,
            user_id: userId,
            expires_at: expiresAt,
        });

        return token;
    }
}
