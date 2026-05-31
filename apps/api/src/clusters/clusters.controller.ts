import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { User, UserRole } from '@prisma/client';
import { ClustersService } from './clusters.service';
import { CreateClusterDto, ClusterResponseDto, UpdateClusterDto } from './dto/clusters.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles, RequireOtp } from '../auth/decorators/auth.decorators';
import { OtpGuard } from '../auth/guards/otp.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('clusters')
@Controller('clusters')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class ClustersController {
  constructor(private clustersService: ClustersService) {}

  @Post()
  @Roles(UserRole.operator)
  @UseGuards(OtpGuard)
  @RequireOtp('cluster_register')
  @ApiOperation({ summary: 'Register a Kubernetes cluster (OTP required)' })
  @ApiResponse({ status: 201, type: ClusterResponseDto })
  create(@CurrentUser() user: User, @Body() dto: CreateClusterDto) {
    return this.clustersService.create(user.id, dto);
  }

  @Get()
  @Roles(UserRole.viewer)
  @ApiOperation({ summary: 'List registered clusters' })
  findAll() {
    return this.clustersService.findAll();
  }

  @Get(':id')
  @Roles(UserRole.viewer)
  @ApiOperation({ summary: 'Get cluster by ID' })
  findOne(@Param('id') id: string) {
    return this.clustersService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.operator)
  @UseGuards(OtpGuard)
  @RequireOtp('cluster_update')
  @ApiOperation({ summary: 'Update cluster (OTP required)' })
  update(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: UpdateClusterDto) {
    return this.clustersService.update(user.id, id, dto);
  }

  @Post(':id/test')
  @Roles(UserRole.viewer)
  @ApiOperation({ summary: 'Test cluster connection' })
  testConnection(@CurrentUser() user: User, @Param('id') id: string) {
    return this.clustersService.testConnection(user.id, id);
  }
}
