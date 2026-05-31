import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ListPodsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  namespace?: string;
}

export class GetPodLogsQueryDto {
  @ApiPropertyOptional({ default: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  tailLines?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  container?: string;
}

export class RestartDeploymentDto {
  @ApiProperty()
  @IsString()
  namespace!: string;

  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty({ description: 'OTP code required' })
  @IsString()
  otp!: string;
}

export class ListEventsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  namespace?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fieldSelector?: string;
}
