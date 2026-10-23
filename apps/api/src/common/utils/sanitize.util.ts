export function sanitizeAiInput(input: string, maxLength = 8000): string {
  return input
    // Stripping control characters is the point of this regex.
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .slice(0, maxLength)
    .trim();
}

export function stripSecretPatterns(text: string): string {
  return text
    .replace(/password\s*[:=]\s*\S+/gi, 'password=[REDACTED]')
    .replace(/token\s*[:=]\s*\S+/gi, 'token=[REDACTED]')
    .replace(/api[_-]?key\s*[:=]\s*\S+/gi, 'api_key=[REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED]');
}
