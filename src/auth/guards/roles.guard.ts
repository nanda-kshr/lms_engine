import {
    Injectable,
    CanActivate,
    ExecutionContext,
    ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MIN_ROLE_LEVEL_KEY } from '../decorators/min-role-level.decorator';
import { Role, RoleDocument } from '../../schemas/role.schema';

@Injectable()
export class RolesGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        @InjectModel(Role.name) private readonly roleModel: Model<RoleDocument>,
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const requiredLevel = this.reflector.getAllAndOverride<number>(
            MIN_ROLE_LEVEL_KEY,
            [context.getHandler(), context.getClass()],
        );

        // No role requirement set, allow access
        if (requiredLevel === undefined || requiredLevel === null) {
            return true;
        }

        const request = context.switchToHttp().getRequest();
        const user = request.user;

        if (!user?.roleId) {
            throw new ForbiddenException('No role assigned');
        }

        const role = await this.roleModel.findById(user.roleId);
        if (!role) {
            throw new ForbiddenException('Role not found');
        }

        if (role.level < requiredLevel) {
            throw new ForbiddenException('Insufficient permissions');
        }

        return true;
    }
}
