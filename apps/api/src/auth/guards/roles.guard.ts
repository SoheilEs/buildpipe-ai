import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { ROLES_KEY } from '../decorators/auth.decorators';

const ROLE_HIERARCHY: Record<UserRole, number> = {
  viewer: 1,
  operator: 2,
  // Approver is an operator who may also approve (ADR-0002). Separation of duties is enforced
  // per request, not by the role.
  approver: 3,
  admin: 4,
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) return true;

    const { user } = context.switchToHttp().getRequest<{ user: { role: UserRole } }>();
    if (!user) throw new ForbiddenException('Access denied');

    const userLevel = ROLE_HIERARCHY[user.role];
    const hasRole = requiredRoles.some((role) => userLevel >= ROLE_HIERARCHY[role]);

    if (!hasRole) throw new ForbiddenException('Insufficient permissions');
    return true;
  }
}
