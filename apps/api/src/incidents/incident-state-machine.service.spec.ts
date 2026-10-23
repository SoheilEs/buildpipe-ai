import { generateIncidentSignature } from './incident-state-machine.service';

describe('generateIncidentSignature', () => {
  it('should generate consistent signatures', () => {
    const input = {
      resourceType: 'Deployment',
      resourceName: 'payment-service',
      namespace: 'production',
      topReasons: ['OOMKilled', 'CrashLoopBackOff'],
    };
    const sig1 = generateIncidentSignature(input);
    const sig2 = generateIncidentSignature(input);
    expect(sig1).toBe(sig2);
    expect(sig1).toHaveLength(32);
  });

  it('should differ for different resources', () => {
    const sig1 = generateIncidentSignature({ resourceName: 'service-a' });
    const sig2 = generateIncidentSignature({ resourceName: 'service-b' });
    expect(sig1).not.toBe(sig2);
  });
});
