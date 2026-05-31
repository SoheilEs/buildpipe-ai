import { Test, TestingModule } from '@nestjs/testing';
import { EventScorerService } from './event-scorer.service';

describe('EventScorerService', () => {
  let service: EventScorerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EventScorerService],
    }).compile();
    service = module.get(EventScorerService);
  });

  it('should score OOMKilled at 0.95', () => {
    const score = service.score({
      type: 'Warning',
      reason: 'OOMKilled',
      message: 'Container was OOMKilled',
      involvedObject: 'Pod/test',
      namespace: 'default',
    });
    expect(score).toBe(0.95);
  });

  it('should score CrashLoopBackOff at 0.9', () => {
    const score = service.score({
      type: 'Warning',
      reason: 'BackOff',
      message: 'Back-off restarting failed container CrashLoopBackOff',
      involvedObject: 'Pod/test',
      namespace: 'default',
    });
    expect(score).toBeGreaterThanOrEqual(0.75);
  });

  it('should score normal events low', () => {
    const score = service.score({
      type: 'Normal',
      reason: 'Scheduled',
      message: 'Successfully assigned pod',
      involvedObject: 'Pod/test',
      namespace: 'default',
    });
    expect(score).toBe(0.1);
  });
});
