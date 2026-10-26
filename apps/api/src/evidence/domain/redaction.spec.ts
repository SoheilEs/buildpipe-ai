import {
  EvidenceTooComplexError,
  MAX_DEPTH,
  MAX_NODES,
  REDACTED,
  redactString,
  redactValue,
} from './redaction';

// Throwaway, obviously fake values shaped like real secrets.
const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnop';
const PRIVATE_KEY =
  '-----BEGIN RSA PRIVATE KEY-----\nMIIBOgIBAAJBAKj34GkxFhD90vcNLYLInFEX\n-----END RSA PRIVATE KEY-----';
const GITHUB = `ghp_${'a1B2c3D4e5'.repeat(4)}`;
const AWS = 'AKIAABCDEFGHIJKLMNOP';

describe('redactString', () => {
  it.each([
    ['Bearer token', 'Authorization failed for Bearer abc.def-123_xyz=='],
    ['JWT', `session ${JWT} expired`],
    ['private key block', `key follows ${PRIVATE_KEY} end`],
    ['GitHub token', `clone with ${GITHUB}`],
    ['AWS access key id', `using ${AWS} in prod`],
    ['Slack token', 'hook xoxb-1234567890-abcdefghij'],
    ['URL credentials', 'pull https://deploy:hunter2secret@registry.example.test/app'],
    ['password pair', 'start --password=hunter2secret now'],
    ['token pair', 'token: s3cr3tvalue'],
    ['api key pair', 'API_KEY = abcdef123456'],
  ])('replaces a %s', (_name, input) => {
    const { text, redactions } = redactString(input);
    expect(redactions).toBeGreaterThanOrEqual(1);
    expect(text).toContain(REDACTED);
    for (const secret of ['hunter2secret', 's3cr3tvalue', 'abcdef123456', JWT, GITHUB, AWS]) {
      expect(text).not.toContain(secret);
    }
    expect(text).not.toContain('MIIBOgIBAAJBAKj34GkxFhD90vcNLYLInFEX');
  });

  it('keeps the host of a URL whose password was removed', () => {
    expect(redactString('https://deploy:hunter2@registry.example.test/app').text).toBe(
      `https://deploy:${REDACTED}@registry.example.test/app`,
    );
  });

  it('leaves ordinary text alone and counts nothing', () => {
    const input = 'container nginx runs as user 0 on port 80, image sha256:abcdef';
    expect(redactString(input)).toEqual({ text: input, redactions: 0 });
  });

  it('is idempotent', () => {
    const once = redactString(`x ${GITHUB} Bearer abc123`).text;
    expect(redactString(once).text).toBe(once);
  });
});

describe('redactValue', () => {
  it('replaces values under secret-looking keys, whatever their type', () => {
    const { value, redactions } = redactValue({
      password: 'p',
      dbPassword: 'p',
      apiKey: 'k',
      'client-key-data': 'LS0tLS1CRUdJTg==',
      token: { nested: 'x' },
      authorization: 'Basic abc',
      secretRef: ['a', 'b'],
      replicas: 3,
    });
    expect(value).toEqual({
      password: REDACTED,
      dbPassword: REDACTED,
      apiKey: REDACTED,
      'client-key-data': REDACTED,
      token: REDACTED,
      authorization: REDACTED,
      secretRef: REDACTED,
      replicas: 3,
    });
    expect(redactions).toBe(7);
  });

  it('does not count empty secret values as redactions', () => {
    const { value, redactions } = redactValue({ password: '', token: null });
    expect(value).toEqual({ password: '', token: null });
    expect(redactions).toBe(0);
  });

  it('redacts the value of a Kubernetes env entry named like a secret, keeps the others', () => {
    const { value, redactions } = redactValue({
      env: [
        { name: 'DB_PASSWORD', value: 'hunter2' },
        { name: 'LOG_LEVEL', value: 'debug' },
        { name: 'API_TOKEN', valueFrom: { secretKeyRef: { name: 'api', key: 'token' } } },
      ],
    });
    const env = (value as { env: Array<Record<string, unknown>> }).env;
    expect(env[0]).toEqual({ name: 'DB_PASSWORD', value: REDACTED });
    expect(env[1]).toEqual({ name: 'LOG_LEVEL', value: 'debug' });
    // The reference to a Secret object stays visible as structure, its key name is redacted.
    expect(JSON.stringify(env[2])).not.toContain('hunter2');
    expect(redactions).toBeGreaterThanOrEqual(1);
  });

  it('redacts secrets inside nested strings and arrays', () => {
    const { value, redactions } = redactValue({
      spec: {
        containers: [{ args: ['--password=hunter2', `--auth=Bearer abc123`], image: 'nginx:1.27' }],
      },
    });
    const text = JSON.stringify(value);
    expect(text).not.toContain('hunter2');
    expect(text).not.toContain('abc123');
    expect(text).toContain('nginx:1.27');
    expect(redactions).toBe(2);
  });

  it('does not change the input', () => {
    const input = { a: { password: 'x' }, b: ['Bearer abc'] };
    const copy = JSON.parse(JSON.stringify(input));
    redactValue(input);
    expect(input).toEqual(copy);
  });

  it('passes numbers, booleans and null through', () => {
    expect(redactValue({ a: 1, b: true, c: null, d: [1, 2] })).toEqual({
      value: { a: 1, b: true, c: null, d: [1, 2] },
      redactions: 0,
    });
  });

  it('refuses input nested deeper than the limit', () => {
    let deep: unknown = 'x';
    for (let i = 0; i <= MAX_DEPTH + 1; i++) deep = { child: deep };
    expect(() => redactValue(deep)).toThrow(EvidenceTooComplexError);
  });

  it('refuses input with too many values', () => {
    expect(() => redactValue(Array.from({ length: MAX_NODES + 1 }, () => 1))).toThrow(
      EvidenceTooComplexError,
    );
  });
});
