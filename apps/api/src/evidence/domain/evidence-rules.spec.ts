import {
  EVIDENCE_KINDS,
  MAX_CLOCK_SKEW_MS,
  MAX_CONTENT_BYTES,
  MAX_FINDING_EVIDENCE,
  canonicalJson,
  contentHash,
  validateEvidence,
  validateFinding,
} from './evidence-rules';

const NOW = new Date('2026-10-26T12:00:00Z');
const validEvidence = () => ({
  kind: 'workload-spec',
  source: 'kubernetes',
  sourceId: 'apps/v1/Deployment/staging/payments-api',
  sourceVersion: '123456',
  collectedAt: new Date('2026-10-26T11:59:00Z'),
  content: { replicas: 1 },
});

describe('canonicalJson and contentHash', () => {
  it('sorts keys at every level so equal content hashes equally', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: [3, { z: 1, y: 2 }] } })).toBe(
      '{"a":{"c":[3,{"y":2,"z":1}],"d":2},"b":1}',
    );
    expect(contentHash({ a: 1, b: 2 })).toBe(contentHash({ b: 2, a: 1 }));
  });

  it('keeps array order, which is meaningful', () => {
    expect(contentHash([1, 2])).not.toBe(contentHash([2, 1]));
  });

  it('distinguishes different content and types', () => {
    expect(contentHash({ a: 1 })).not.toBe(contentHash({ a: '1' }));
    expect(contentHash(null)).not.toBe(contentHash({}));
  });

  it('ignores undefined properties like JSON does', () => {
    expect(contentHash({ a: 1, b: undefined })).toBe(contentHash({ a: 1 }));
  });

  it('gives a 64-character hex digest', () => {
    expect(contentHash({ x: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('validateEvidence', () => {
  it('accepts a complete item', () => {
    expect(validateEvidence(validEvidence(), NOW)).toEqual({});
  });

  it('lets every kind be produced by its declared sources only', () => {
    for (const [kind, sources] of Object.entries(EVIDENCE_KINDS)) {
      for (const source of ['kubernetes', 'kubescape', 'registry', 'git']) {
        const problems = validateEvidence({ ...validEvidence(), kind, source }, NOW);
        const allowed = (sources as readonly string[]).includes(source);
        expect(problems.source === undefined).toBe(allowed);
      }
    }
    expect(Object.keys(EVIDENCE_KINDS)).toHaveLength(5);
  });

  it.each(['', 'unknown-kind', 'Workload-Spec', undefined, 5])('rejects kind %p', (kind) => {
    expect(validateEvidence({ ...validEvidence(), kind }, NOW)).toHaveProperty('kind');
  });

  it.each(['', 'github', undefined, null])('rejects source %p', (source) => {
    expect(validateEvidence({ ...validEvidence(), source }, NOW)).toHaveProperty('source');
  });

  it.each(['', '   ', 'x'.repeat(501), 'a\nb', 'a\u0000b', undefined, 7])(
    'rejects sourceId %p',
    (sourceId) => {
      expect(validateEvidence({ ...validEvidence(), sourceId }, NOW)).toHaveProperty('sourceId');
    },
  );

  it.each(['', '   ', 'x'.repeat(201), 'v\n1', undefined, null])(
    'requires a printable sourceVersion (%p)',
    (sourceVersion) => {
      expect(validateEvidence({ ...validEvidence(), sourceVersion }, NOW).sourceVersion).toMatch(
        /required/,
      );
    },
  );

  describe('collectedAt', () => {
    it.each([new Date('invalid'), '2026-10-26', 1761480000000, null, undefined])(
      'rejects %p',
      (collectedAt) => {
        expect(validateEvidence({ ...validEvidence(), collectedAt }, NOW)).toHaveProperty(
          'collectedAt',
        );
      },
    );

    it('tolerates a small clock skew and rejects the future beyond it', () => {
      const within = new Date(NOW.getTime() + MAX_CLOCK_SKEW_MS);
      const beyond = new Date(NOW.getTime() + MAX_CLOCK_SKEW_MS + 1);
      expect(validateEvidence({ ...validEvidence(), collectedAt: within }, NOW)).toEqual({});
      expect(validateEvidence({ ...validEvidence(), collectedAt: beyond }, NOW)).toHaveProperty(
        'collectedAt',
      );
    });

    it('accepts old timestamps: evidence can be re-recorded later', () => {
      expect(
        validateEvidence(
          { ...validEvidence(), collectedAt: new Date('2020-01-01T00:00:00Z') },
          NOW,
        ),
      ).toEqual({});
    });
  });

  describe('content', () => {
    it('is required, but null, empty and falsy JSON values are allowed content', () => {
      expect(validateEvidence({ ...validEvidence(), content: undefined }, NOW)).toHaveProperty(
        'content',
      );
      for (const content of [null, {}, [], 0, false, '']) {
        expect(validateEvidence({ ...validEvidence(), content }, NOW)).toEqual({});
      }
    });

    it('is limited in size', () => {
      const big = { blob: 'x'.repeat(MAX_CONTENT_BYTES) };
      expect(validateEvidence({ ...validEvidence(), content: big }, NOW)).toHaveProperty('content');
      const fits = { blob: 'x'.repeat(MAX_CONTENT_BYTES - 20) };
      expect(validateEvidence({ ...validEvidence(), content: fits }, NOW)).toEqual({});
    });
  });

  it('reports every bad field at once', () => {
    const problems = validateEvidence(
      {
        kind: 'x',
        source: 'y',
        sourceId: '',
        sourceVersion: '',
        collectedAt: 'no',
        content: undefined,
      },
      NOW,
    );
    expect(Object.keys(problems).sort()).toEqual(
      ['collectedAt', 'content', 'kind', 'source', 'sourceId', 'sourceVersion'].sort(),
    );
  });
});

describe('validateFinding', () => {
  const valid = (over: Record<string, unknown> = {}) => ({
    code: 'RUNS_AS_ROOT',
    outcome: 'Present',
    summary: 'The container runs as user 0',
    evidenceIds: ['e1'],
    ...over,
  });

  it('accepts a Present finding with evidence', () => {
    expect(validateFinding(valid())).toEqual({});
  });

  it.each(['Present', 'Absent'])('a %s finding needs at least one evidence item', (outcome) => {
    expect(validateFinding(valid({ outcome, evidenceIds: [] })).evidenceIds).toMatch(
      /at least one/,
    );
  });

  it('an Unknown finding may cite nothing, but still needs its explanation', () => {
    expect(validateFinding(valid({ outcome: 'Unknown', evidenceIds: [] }))).toEqual({});
    expect(
      validateFinding(valid({ outcome: 'Unknown', evidenceIds: [], summary: '' })),
    ).toHaveProperty('summary');
  });

  it('a Conflicting finding needs two or more', () => {
    expect(
      validateFinding(valid({ outcome: 'Conflicting', evidenceIds: ['e1'] })).evidenceIds,
    ).toMatch(/two/);
    expect(validateFinding(valid({ outcome: 'Conflicting', evidenceIds: ['e1', 'e2'] }))).toEqual(
      {},
    );
  });

  it.each(['', 'lower', 'HAS SPACE', 'AB', 'A'.repeat(65), '1_STARTS_WITH_DIGIT', undefined])(
    'rejects code %p',
    (code) => {
      expect(validateFinding(valid({ code }))).toHaveProperty('code');
    },
  );

  it.each(['present', 'Maybe', '', undefined])('rejects outcome %p', (outcome) => {
    expect(validateFinding(valid({ outcome }))).toHaveProperty('outcome');
  });

  it.each(['', '   ', 'x'.repeat(1001), 'a\u0000b'])('rejects summary %p', (summary) => {
    expect(validateFinding(valid({ summary }))).toHaveProperty('summary');
  });

  it.each([undefined, 'e1', [''], [1], [null]])('rejects evidenceIds %p', (evidenceIds) => {
    expect(validateFinding(valid({ evidenceIds }))).toHaveProperty('evidenceIds');
  });

  it('rejects duplicates and too many references', () => {
    expect(validateFinding(valid({ evidenceIds: ['e1', 'e1'] })).evidenceIds).toMatch(/duplicates/);
    const many = Array.from({ length: MAX_FINDING_EVIDENCE + 1 }, (_, i) => `e${i}`);
    expect(validateFinding(valid({ evidenceIds: many })).evidenceIds).toMatch(/at most/);
  });
});
