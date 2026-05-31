import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { IncidentStatus, User, UserRole } from '@prisma/client';
import { Throttle } from '@nestjs/throttler';
import { IncidentsService } from './incidents.service';
import {
  AnalyzeIncidentDto,
  CreateIncidentDto,
  IncidentResponseDto,
  ResolveIncidentDto,
} from './dto/incidents.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/auth.decorators';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('incidents')
@Controller('incidents')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class IncidentsController {
  constructor(private incidentsService: IncidentsService) {}

  @Post()
  @Roles(UserRole.operator)
  @ApiOperation({ summary: 'Create a new incident' })
  @ApiResponse({ status: 201, type: IncidentResponseDto })
  create(@CurrentUser() user: User, @Body() dto: CreateIncidentDto) {
    return this.incidentsService.create(user.id, dto);
  }

  @Get()
  @Roles(UserRole.viewer)
  @ApiOperation({ summary: 'List incidents' })
  @ApiQuery({ name: 'status', required: false, enum: IncidentStatus })
  findAll(@Query('status') status?: IncidentStatus) {
    return this.incidentsService.findAll(status);
  }

  @Get(':id')
  @Roles(UserRole.viewer)
  @ApiOperation({ summary: 'Get incident by ID' })
  findOne(@Param('id') id: string) {
    return this.incidentsService.findOne(id);
  }

  @Post(':id/analyze')
  @Roles(UserRole.operator)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Trigger AI analysis for incident' })
  analyze(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body() dto: AnalyzeIncidentDto,
  ) {
    return this.incidentsService.analyze(id, user.id, dto);
  }

  @Post(':id/resolve')
  @Roles(UserRole.operator)
  @ApiOperation({ summary: 'Resolve an incident' })
  resolve(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body() dto: ResolveIncidentDto,
  ) {
    return this.incidentsService.resolve(id, user.id, dto);
  }
}
