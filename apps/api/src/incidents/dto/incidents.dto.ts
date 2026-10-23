import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { IncidentStatus, RiskLevel } from '@prisma/client';

export class CreateIncidentDto {
  @ApiProperty()
  @IsUUID()
  clusterId!: string;

  @ApiProperty({ example: 'payment-service failing' })
  @IsString()
  @MinLength(3)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'Deployment' })
  @IsOptional()
  @IsString()
  resourceType?: string;

  @ApiPropertyOptional({ example: 'payment-service' })
  @IsOptional()
  @IsString()
  resourceName?: string;

  @ApiPropertyOptional({ example: 'production' })
  @IsOptional()
  @IsString()
  namespace?: string;
}

export class AnalyzeIncidentDto {
  @ApiPropertyOptional({ enum: ['openai', 'claude'] })
  @IsOptional()
  @IsString()
  provider?: 'openai' | 'claude';

  @ApiPropertyOptional({ description: 'Run synchronously instead of queue' })
  @IsOptional()
  sync?: boolean;
}

export class ResolveIncidentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  resolution?: string;
}

export class IncidentResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  clusterId!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ enum: IncidentStatus })
  status!: IncidentStatus;

  @ApiPropertyOptional()
  signature?: string | null;
}

export class AiAnalysisResponseDto {
  @ApiProperty()
  rootCause!: string;

  @ApiProperty()
  confidence!: number;

  @ApiProperty({ type: [String] })
  evidence!: string[];

  @ApiProperty({ type: [String] })
  recommendations!: string[];

  @ApiProperty({ enum: RiskLevel })
  riskLevel!: RiskLevel;
}
