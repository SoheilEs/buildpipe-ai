import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateClusterDto {
  @ApiProperty({ example: 'production-us-east' })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiProperty({ description: 'Kubeconfig YAML content' })
  @IsString()
  kubeconfig!: string;

  @ApiPropertyOptional({ example: 'my-context' })
  @IsOptional()
  @IsString()
  context?: string;

  @ApiProperty({ example: '123456', description: 'OTP code for sensitive action' })
  @IsString()
  otp!: string;
}

export class UpdateClusterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  kubeconfig?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  context?: string;

  @ApiProperty()
  @IsString()
  otp!: string;
}

export class ClusterResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional()
  context?: string | null;

  @ApiPropertyOptional()
  lastConnectedAt?: Date | null;

  @ApiProperty()
  createdAt!: Date;
}
