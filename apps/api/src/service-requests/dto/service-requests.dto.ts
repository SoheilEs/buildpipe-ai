import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { REQUEST_STATES } from '../domain/request-state';
import { SERVICE_CARDS } from '../domain/service-cards';

export class CreateServiceRequestDto {
  @ApiProperty({ description: 'A registered service' })
  @IsUUID()
  serviceId!: string;

  @ApiProperty({ enum: SERVICE_CARDS })
  @IsString()
  @MaxLength(100)
  kind!: string;
}

export class CancelServiceRequestDto {
  @ApiProperty({ description: 'Why the request is cancelled; kept in the history' })
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  reason!: string;
}

export class ListServiceRequestsQuery {
  @ApiPropertyOptional({ enum: REQUEST_STATES })
  @IsOptional()
  @IsIn(REQUEST_STATES as readonly string[])
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  requesterId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  serviceId?: string;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ default: 0, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
