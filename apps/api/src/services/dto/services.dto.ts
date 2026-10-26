import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/**
 * Types only. The real rules (DNS names, git refs, safe paths) live in
 * domain/service-validation.ts so they are unit-tested without HTTP.
 */
export class CreateServiceDto {
  @ApiProperty({ example: 'Payments API' })
  @IsString()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ description: 'Registered cluster that runs the workload' })
  @IsUUID()
  clusterId!: string;

  @ApiProperty({ example: 'staging' })
  @IsString()
  namespace!: string;

  @ApiProperty({ enum: ['Deployment', 'StatefulSet'] })
  @IsString()
  workloadKind!: string;

  @ApiProperty({ example: 'payments-api' })
  @IsString()
  workloadName!: string;

  @ApiPropertyOptional({ example: 'github', default: 'github' })
  @IsOptional()
  @IsString()
  gitProvider?: string;

  @ApiProperty({ example: 'acme/infra-config' })
  @IsString()
  gitRepository!: string;

  @ApiPropertyOptional({ example: 'main', default: 'main' })
  @IsOptional()
  @IsString()
  gitBaseBranch?: string;

  @ApiProperty({ example: ['apps/payments/deployment.yaml'] })
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  configPaths!: string[];
}

export class UpdateServiceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  clusterId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  namespace?: string;

  @ApiPropertyOptional({ enum: ['Deployment', 'StatefulSet'] })
  @IsOptional()
  @IsString()
  workloadKind?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  workloadName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  gitProvider?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  gitRepository?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  gitBaseBranch?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  configPaths?: string[];
}
