import { AiAnalysisOutput, parseAiAnalysisOutput } from '@buildpipe/shared-types';

export interface AiProvider {
  readonly name: string;
  analyze(prompt: string, systemPrompt: string): Promise<AiAnalysisOutput>;
}

export { parseAiAnalysisOutput };
export type { AiAnalysisOutput };

export function parseJsonFromResponse(text: string): unknown {
  const trimmed = text.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON object found in AI response');
  return JSON.parse(jsonMatch[0]);
}
