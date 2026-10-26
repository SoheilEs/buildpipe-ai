import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsString, MinLength } from 'class-validator';
import { OtpPurpose } from '@prisma/client';

export class RegisterDto {
  @ApiProperty({ example: 'user@buildpipe.ai' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'SecurePass123!', minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;
}

export class LoginDto {
  @ApiProperty({ example: 'admin@buildpipe.ai' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'your-password' })
  @IsString()
  password!: string;
}

export class RefreshTokenDto {
  @ApiProperty()
  @IsString()
  refreshToken!: string;
}

export class RequestOtpDto {
  @ApiProperty({ enum: OtpPurpose, example: 'deployment_restart' })
  @IsEnum(OtpPurpose)
  purpose!: OtpPurpose;
}

export class VerifyOtpDto {
  @ApiProperty({ example: '123456' })
  @IsString()
  code!: string;

  @ApiProperty({ enum: OtpPurpose, example: 'deployment_restart' })
  @IsEnum(OtpPurpose)
  purpose!: OtpPurpose;
}

export class AuthTokensDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty()
  refreshToken!: string;

  @ApiProperty()
  expiresIn!: string;
}

export class AuthResponseDto extends AuthTokensDto {
  @ApiProperty()
  user!: {
    id: string;
    email: string;
    role: string;
  };
}
