import { Controller, Post, Body } from '@nestjs/common';
import { AiEngineService } from './ai-engine.service';
import { IncidentContext } from '@buildpipe/shared-types';

@Controller()
export class AiEngineController {
  constructor(private aiEngine: AiEngineService) {}

  @Post('analyze')
  analyze(@Body() context: IncidentContext) {
    return this.aiEngine.analyzeContext(context);
  }

  @Post('health')
  health() {
    return { status: 'ok', service: 'ai-engine' };
  }
}
