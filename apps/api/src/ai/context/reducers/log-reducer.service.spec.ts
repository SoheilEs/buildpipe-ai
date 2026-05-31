import { Test, TestingModule } from '@nestjs/testing';
import { LogReducerService } from './log-reducer.service';

describe('LogReducerService', () => {
  let service: LogReducerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [LogReducerService],
    }).compile();
    service = module.get(LogReducerService);
  });

  it('should remove noise and group repeated messages', () => {
    const logs = `
      ERROR payment failed: timeout
      ERROR payment failed: timeout
      INFO health check ok
      WARN connection retry
      GET / 200
    `;
    const result = service.reduce(logs);
    expect(result.some((r) => r.level === 'error')).toBe(true);
    expect(result.find((r) => r.message.includes('payment failed'))?.count).toBe(2);
    expect(result.some((r) => r.message.includes('GET /'))).toBe(false);
  });

  it('should respect max character limit', () => {
    const longLine = 'ERROR ' + 'x'.repeat(10000);
    const result = service.reduce(longLine, 1000);
    const totalChars = result.reduce((sum, r) => sum + r.message.length, 0);
    expect(totalChars).toBeLessThanOrEqual(1000);
  });
});
