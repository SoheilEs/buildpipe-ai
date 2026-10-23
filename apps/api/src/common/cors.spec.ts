import { corsOriginHandler, parseCorsOrigins } from './cors';

describe('parseCorsOrigins', () => {
  it('treats unset and empty as no origins', () => {
    expect(parseCorsOrigins(undefined)).toEqual([]);
    expect(parseCorsOrigins('')).toEqual([]);
    expect(parseCorsOrigins(' , ,')).toEqual([]);
  });

  it('splits, trims and drops trailing slashes', () => {
    expect(parseCorsOrigins(' https://a.example.com/ ,https://b.example.com ')).toEqual([
      'https://a.example.com',
      'https://b.example.com',
    ]);
  });
});

describe('corsOriginHandler (S5)', () => {
  const original = process.env.CORS_ORIGIN;
  afterEach(() => {
    if (original === undefined) delete process.env.CORS_ORIGIN;
    else process.env.CORS_ORIGIN = original;
  });

  const decide = (origin: string | undefined): boolean | undefined => {
    let result: boolean | undefined;
    corsOriginHandler()(origin, (_error, allow) => {
      result = allow;
    });
    return result;
  };

  it('denies every browser origin by default', () => {
    delete process.env.CORS_ORIGIN;
    expect(decide('https://evil.example')).toBe(false);
    process.env.CORS_ORIGIN = '';
    expect(decide('https://evil.example')).toBe(false);
  });

  it('allows requests without an Origin header (not CORS requests)', () => {
    delete process.env.CORS_ORIGIN;
    expect(decide(undefined)).toBe(true);
  });

  it('allows only listed origins, ignoring a trailing slash', () => {
    process.env.CORS_ORIGIN = 'https://app.example.com,https://admin.example.com';
    expect(decide('https://app.example.com')).toBe(true);
    expect(decide('https://admin.example.com/')).toBe(true);
    expect(decide('https://evil.example')).toBe(false);
    expect(decide('https://app.example.com.evil.example')).toBe(false);
    expect(decide('http://app.example.com')).toBe(false);
  });

  it('reads the allowlist on every request', () => {
    process.env.CORS_ORIGIN = 'https://one.example.com';
    const handler = corsOriginHandler();
    let result: boolean | undefined;
    process.env.CORS_ORIGIN = 'https://two.example.com';
    handler('https://two.example.com', (_e, allow) => {
      result = allow;
    });
    expect(result).toBe(true);
  });

  it('allows any origin only for an explicit *', () => {
    process.env.CORS_ORIGIN = '*';
    expect(decide('https://anything.example')).toBe(true);
  });
});
