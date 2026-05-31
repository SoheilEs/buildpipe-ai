import { Injectable } from '@nestjs/common';
import { IncidentContext } from '@buildpipe/shared-types';
import { buildAnalysisPrompt, SYSTEM_PROMPT } from '../providers/ai-providers';

@Injectable()
export class PromptBuilderService {
  build(context: IncidentContext): { systemPrompt: string; userPrompt: string } {
    const userPrompt = buildAnalysisPrompt(context);
    return {
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
    };
  }
}
