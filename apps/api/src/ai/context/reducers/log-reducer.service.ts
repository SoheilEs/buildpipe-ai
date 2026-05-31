import { Injectable } from '@nestjs/common';

const NOISE_PATTERNS = [
  /^[\s]*$/,
  /health\s*check/i,
  /GET\s+\/\s*200/i,
  /liveness probe/i,
  /readiness probe/i,
];

@Injectable()
export class LogReducerService {
  reduce(rawLogs: string, maxChars = 8000): Array<{ level: string; message: string; count: number }> {
    const lines = rawLogs.split('\n').filter((line) => !this.isNoise(line));
    const grouped = new Map<string, { level: string; message: string; count: number }>();

    for (const line of lines) {
      const level = this.detectLevel(line);
      const normalized = line.trim().slice(0, 500);
      const key = `${level}:${normalized}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        grouped.set(key, { level, message: normalized, count: 1 });
      }
    }

    const prioritized = [...grouped.values()].sort((a, b) => {
      const priority = (level: string) =>
        level === 'error' ? 3 : level === 'warn' ? 2 : level === 'info' ? 1 : 0;
      return priority(b.level) - priority(a.level) || b.count - a.count;
    });

    let totalChars = 0;
    const result: Array<{ level: string; message: string; count: number }> = [];
    for (const entry of prioritized) {
      if (totalChars + entry.message.length > maxChars) break;
      result.push(entry);
      totalChars += entry.message.length;
    }
    return result;
  }

  private isNoise(line: string): boolean {
    return NOISE_PATTERNS.some((p) => p.test(line));
  }

  private detectLevel(line: string): string {
    if (/error|fatal|exception|panic/i.test(line)) return 'error';
    if (/warn|warning/i.test(line)) return 'warn';
    if (/info/i.test(line)) return 'info';
    return 'debug';
  }
}
