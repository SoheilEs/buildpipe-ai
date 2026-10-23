import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

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

  @ApiProperty({ example: 'Admin123!' })
  @IsString()
  password!: string;
}

export class RefreshTokenDto {
  @ApiProperty()
  @IsString()
  refreshToken!: string;
}

export class RequestOtpDto {
  @ApiProperty({ example: 'deployment_restart' })
  @IsString()
  purpose!: string;
}

export class VerifyOtpDto {
  @ApiProperty({ example: '123456' })
  @IsString()
  code!: string;

  @ApiProperty({ example: 'deployment_restart' })
  @IsString()
  purpose!: string;
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
