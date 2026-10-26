import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomInt, randomUUID, createHash } from 'crypto';
import { OtpPurpose } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '@buildpipe/shared-types';

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private config: ConfigService,
  ) {}

  async requestOtp(
    userId: string,
    purpose: OtpPurpose,
  ): Promise<{ message: string; devCode?: string }> {
    const code = randomInt(100000, 999999).toString();
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await this.prisma.otpChallenge.create({
      data: { userId, codeHash, purpose, expiresAt },
    });

    await this.audit.log({
      userId,
      action: AuditAction.OTP_REQUESTED,
      resource: 'otp',
      metadata: { purpose },
    });

    // Fail closed: the code only leaves this method when OTP_DEV_MODE is explicitly 'true'.
    // There is no delivery channel yet (see docs/history/buildpipe/blockers.md B7), so without
    // the flag an OTP is issued but cannot reach the user.
    if (this.config.get<string>('OTP_DEV_MODE') === 'true') {
      this.logger.warn(`OTP_DEV_MODE: OTP for ${purpose} user ${userId}: ${code}`);
      return { message: 'OTP issued (dev mode)', devCode: code };
    }

    this.logger.log(`OTP issued for ${purpose} user ${userId}`);
    return { message: 'OTP issued' };
  }

  async verifyOtp(userId: string, code: string, purpose: OtpPurpose): Promise<boolean> {
    const challenge = await this.prisma.otpChallenge.findFirst({
      where: {
        userId,
        purpose,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!challenge) return false;

    const valid = await bcrypt.compare(code, challenge.codeHash);
    if (!valid) return false;

    await this.prisma.otpChallenge.update({
      where: { id: challenge.id },
      data: { consumedAt: new Date() },
    });

    await this.audit.log({
      userId,
      action: AuditAction.OTP_VERIFIED,
      resource: 'otp',
      metadata: { purpose },
    });

    return true;
  }
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateRefreshToken(): string {
  return randomUUID() + randomUUID();
}
