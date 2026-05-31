import {
  Injectable,
  CanActivate,
  ExecutionContext,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OtpPurpose } from '@prisma/client';
import { OTP_KEY } from '../decorators/auth.decorators';
import { OtpService } from '../otp.service';

@Injectable()
export class OtpGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private otpService: OtpService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const otpMeta = this.reflector.getAllAndOverride<boolean | string>(OTP_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!otpMeta) return true;

    const request = context.switchToHttp().getRequest<{
      user: { id: string };
      headers: Record<string, string>;
      body: { otp?: string };
    }>();

    const otpCode = request.headers['x-otp-code'] || request.body?.otp;
    if (!otpCode) throw new BadRequestException('OTP code required for this action');

    const purpose = typeof otpMeta === 'string' ? (otpMeta as OtpPurpose) : OtpPurpose.mcp_sensitive;
    const valid = await this.otpService.verifyOtp(request.user.id, otpCode, purpose);
    if (!valid) throw new UnauthorizedException('Invalid or expired OTP');

    return true;
  }
}
