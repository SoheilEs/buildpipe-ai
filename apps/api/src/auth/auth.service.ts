import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { AuthProvider, User, UserRole } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '@buildpipe/shared-types';
import { generateRefreshToken, hashToken } from './otp.service';
import { AuthResponseDto, LoginDto, RegisterDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private audit: AuditService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        // Public self-registration never chooses a role; admins promote users via PATCH /users/:id.
        role: UserRole.viewer,
      },
    });

    await this.audit.log({
      userId: user.id,
      action: AuditAction.REGISTER,
      resource: 'user',
      resourceId: user.id,
    });

    return this.issueTokens(user);
  }

  async login(dto: LoginDto, ip?: string, userAgent?: string): Promise<AuthResponseDto> {
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email, deletedAt: null },
    });

    if (!user?.passwordHash) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    await this.audit.log({
      userId: user.id,
      action: AuditAction.LOGIN,
      resource: 'user',
      resourceId: user.id,
      ip,
      userAgent,
    });

    return this.issueTokens(user);
  }

  async refresh(refreshToken: string): Promise<AuthResponseDto> {
    const tokenHash = hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    await this.audit.log({
      userId: stored.userId,
      action: AuditAction.REFRESH_TOKEN,
      resource: 'refresh_token',
      resourceId: stored.id,
    });

    return this.issueTokens(stored.user, stored.familyId);
  }

  async logout(userId: string, refreshToken?: string): Promise<void> {
    if (refreshToken) {
      const tokenHash = hashToken(refreshToken);
      await this.prisma.refreshToken.updateMany({
        where: { tokenHash, userId },
        data: { revokedAt: new Date() },
      });
    }

    await this.audit.log({
      userId,
      action: AuditAction.LOGOUT,
      resource: 'user',
      resourceId: userId,
    });
  }

  async findOrCreateOAuthUser(data: {
    email: string;
    provider: AuthProvider;
    providerId: string;
  }): Promise<User> {
    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: data.email }, { provider: data.provider, providerId: data.providerId }],
        deletedAt: null,
      },
    });

    if (existing) return existing;

    return this.prisma.user.create({
      data: {
        email: data.email,
        provider: data.provider,
        providerId: data.providerId,
        role: UserRole.viewer,
      },
    });
  }

  async issueTokensForUser(user: User): Promise<AuthResponseDto> {
    return this.issueTokens(user);
  }

  private async issueTokens(user: User, familyId?: string): Promise<AuthResponseDto> {
    const family = familyId ?? randomUUID();
    const accessExpiresIn = this.config.get<string>('JWT_ACCESS_EXPIRES_IN', '15m');

    const accessToken = await this.jwt.signAsync(
      { sub: user.id, email: user.email, role: user.role },
      {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
        expiresIn: accessExpiresIn,
      },
    );

    const refreshToken = generateRefreshToken();
    const refreshExpires = this.config.get<string>('JWT_REFRESH_EXPIRES_IN', '7d');
    const expiresMs = this.parseExpiry(refreshExpires);

    await this.prisma.refreshToken.create({
      data: {
        tokenHash: hashToken(refreshToken),
        userId: user.id,
        familyId: family,
        expiresAt: new Date(Date.now() + expiresMs),
      },
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: accessExpiresIn,
      user: { id: user.id, email: user.email, role: user.role },
    };
  }

  private parseExpiry(expiry: string): number {
    const match = expiry.match(/^(\d+)([smhd])$/);
    if (!match) return 7 * 24 * 60 * 60 * 1000;
    const value = parseInt(match[1], 10);
    const unit = match[2];
    const multipliers: Record<string, number> = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
    return value * (multipliers[unit] ?? 86400000);
  }
}
