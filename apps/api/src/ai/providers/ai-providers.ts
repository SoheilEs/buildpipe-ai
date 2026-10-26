import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiAnalysisOutput, IncidentContext } from '@buildpipe/shared-types';
import { AiProvider, parseAiAnalysisOutput, parseJsonFromResponse } from '@buildpipe/ai-sdk';

@Injectable()
export class OpenAiProvider implements AiProvider {
  readonly name = 'openai';
  private readonly apiKey: string;
  private readonly model = 'gpt-4o-mini';

  constructor(private config: ConfigService) {
    this.apiKey = this.config.get<string>('OPENAI_API_KEY') ?? '';
  }

  async analyze(prompt: string, systemPrompt: string): Promise<AiAnalysisOutput> {
    if (!this.apiKey) {
      return this.fallbackResponse('OpenAI API key not configured');
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return this.fallbackResponse(`OpenAI API error: ${err}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    const content = data.choices[0]?.message?.content ?? '{}';
    return parseAiAnalysisOutput(parseJsonFromResponse(content));
  }

  private fallbackResponse(reason: string): AiAnalysisOutput {
    return {
      rootCause: 'Insufficient data for analysis',
      confidence: 0.1,
      evidence: [reason],
      recommendations: ['Verify AI provider configuration and retry'],
      riskLevel: 'low',
    };
  }
}

@Injectable()
export class ClaudeProvider implements AiProvider {
  readonly name = 'claude';
  private readonly apiKey: string;
  private readonly model = 'claude-3-5-haiku-20241022';

  constructor(private config: ConfigService) {
    this.apiKey = this.config.get<string>('ANTHROPIC_API_KEY') ?? '';
  }

  async analyze(prompt: string, systemPrompt: string): Promise<AiAnalysisOutput> {
    if (!this.apiKey) {
      return {
        rootCause: 'Insufficient data for analysis',
        confidence: 0.1,
        evidence: ['Anthropic API key not configured'],
        recommendations: ['Configure ANTHROPIC_API_KEY and retry'],
        riskLevel: 'low',
      };
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return {
        rootCause: 'Insufficient data for analysis',
        confidence: 0.1,
        evidence: [`Claude API error: ${err}`],
        recommendations: ['Retry analysis later'],
        riskLevel: 'low',
      };
    }

    const data = (await response.json()) as {
      content: Array<{ type: string; text: string }>;
    };
    const text = data.content.find((c) => c.type === 'text')?.text ?? '{}';
    return parseAiAnalysisOutput(parseJsonFromResponse(text));
  }
}

export const SYSTEM_PROMPT = `You are an expert Kubernetes SRE assistant for Infralark.

RULES:
- Use ONLY the infrastructure context provided in the user message.
- NEVER guess missing data.
- NEVER hallucinate metrics or cluster state.
- If data is insufficient, return confidence below 0.4 and explain in evidence.
- Respond with valid JSON matching this schema:
{
  "rootCause": "string",
  "confidence": 0.0-1.0,
  "evidence": ["string"],
  "recommendations": ["string"],
  "riskLevel": "low|medium|high"
}`;

export function buildAnalysisPrompt(context: IncidentContext): string {
  return JSON.stringify(context, null, 2);
}
