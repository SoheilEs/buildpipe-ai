import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { User, UserRole } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/auth.decorators';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateServiceDto, UpdateServiceDto } from './dto/services.dto';
import { ServicesService } from './services.service';

@ApiTags('services')
@Controller('services')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class ServicesController {
  constructor(private readonly services: ServicesService) {}

  @Get()
  @Roles(UserRole.viewer)
  @ApiOperation({ summary: 'List registered services' })
  findAll() {
    return this.services.findAll();
  }

  @Get(':id')
  @Roles(UserRole.viewer)
  @ApiOperation({ summary: 'Get a service' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.services.findOne(id);
  }

  @Post()
  @Roles(UserRole.admin)
  @ApiOperation({ summary: 'Register a service (admin only)' })
  create(@CurrentUser() user: User, @Body() dto: CreateServiceDto) {
    return this.services.create(user.id, dto);
  }

  @Patch(':id')
  @Roles(UserRole.admin)
  @ApiOperation({ summary: 'Update a service (admin only)' })
  update(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateServiceDto,
  ) {
    return this.services.update(user.id, id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.admin)
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a service without requests (admin only)' })
  remove(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.services.remove(user.id, id);
  }
}
