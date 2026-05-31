import { z } from 'zod';

export const aiAnalysisOutputSchema = z.object({
  rootCause: z.string(),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string()),
  recommendations: z.array(z.string()),
  riskLevel: z.enum(['low', 'medium', 'high']),
});

export type AiAnalysisOutput = z.infer<typeof aiAnalysisOutputSchema>;

export function parseAiAnalysisOutput(data: unknown): AiAnalysisOutput {
  return aiAnalysisOutputSchema.parse(data);
}
