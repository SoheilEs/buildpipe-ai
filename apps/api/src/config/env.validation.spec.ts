import { readFileSync } from 'fs';
import { resolve } from 'path';
import { KNOWN_PUBLISHED_SECRETS, secretProblem, validateEnv } from './env.validation';

const strong = (seed: string) => `${seed}-Xk29fQ7pLm3VzR8tYb4NcW6hJd1sGa5E`;

const validEnv = () => ({
  NODE_ENV: 'production',
  JWT_SECRET: strong('jwt'),
  ENCRYPTION_KEY: strong('enc'),
});

describe('validateEnv DATABASE_URL', () => {
  it('accepts a postgresql:// URL', () => {
    expect(() =>
      validateEnv({ ...validEnv(), DATABASE_URL: 'postgresql://u:p@db:5432/app?schema=public' }),
    ).not.toThrow();
  });

  it('accepts a missing DATABASE_URL (the API does not require it at boot)', () => {
    expect(() => validateEnv(validEnv())).not.toThrow();
  });

  it('rejects a DATABASE_URL that still has the CHANGE_ME placeholder', () => {
    expect(() =>
      validateEnv({ ...validEnv(), DATABASE_URL: 'postgresql://u:CHANGE_ME@db:5432/app' }),
    ).toThrow(/CHANGE_ME placeholder/);
  });

  it.each(['file:/app/data/buildpipe.db', 'mysql://u:p@db/app'])('rejects %s', (url) => {
    expect(() => validateEnv({ ...validEnv(), DATABASE_URL: url })).toThrow(
      /DATABASE_URL must be a postgresql/,
    );
  });
});

describe('validateEnv (S4)', () => {
  it('accepts strong, distinct secrets', () => {
    const env = validEnv();
    expect(validateEnv(env)).toBe(env);
  });

  it('accepts a strong optional JWT_REFRESH_SECRET', () => {
    expect(() =>
      validateEnv({ ...validEnv(), JWT_REFRESH_SECRET: strong('refresh') }),
    ).not.toThrow();
  });

  it.each(['JWT_SECRET', 'ENCRYPTION_KEY'])('requires %s', (key) => {
    const env: Record<string, unknown> = validEnv();
    delete env[key];
    expect(() => validateEnv(env)).toThrow(new RegExp(`${key} is not set`));
  });

  it.each([...KNOWN_PUBLISHED_SECRETS])('rejects the published value %s', (value) => {
    expect(() => validateEnv({ ...validEnv(), JWT_SECRET: value })).toThrow(/published/);
    expect(() => validateEnv({ ...validEnv(), ENCRYPTION_KEY: value })).toThrow(/published/);
  });

  it.each(['CHANGE_ME', 'change-me', 'CHANGEME', strong('CHANGE_ME')])(
    'rejects the placeholder %s',
    (value) => {
      expect(() => validateEnv({ ...validEnv(), JWT_SECRET: value })).toThrow(/CHANGE_ME/);
    },
  );

  it('rejects secrets shorter than 32 characters', () => {
    expect(() => validateEnv({ ...validEnv(), JWT_SECRET: 'Xk29fQ7pLm3VzR8tYb4NcW6hJd1' })).toThrow(
      /shorter than 32/,
    );
  });

  it('rejects long but low-variety secrets', () => {
    expect(() => validateEnv({ ...validEnv(), ENCRYPTION_KEY: 'a'.repeat(64) })).toThrow(
      /too little variety/,
    );
    expect(() => validateEnv({ ...validEnv(), ENCRYPTION_KEY: 'ab'.repeat(40) })).toThrow(
      /too little variety/,
    );
  });

  it('rejects reusing one value for two secrets', () => {
    const shared = strong('shared');
    expect(() =>
      validateEnv({ ...validEnv(), JWT_SECRET: shared, ENCRYPTION_KEY: shared }),
    ).toThrow(/must not be the same value/);
  });

  it('reports every problem at once, without echoing the secret values', () => {
    let message = '';
    try {
      validateEnv({ NODE_ENV: 'production', JWT_SECRET: 'short-secret', CORS_ORIGIN: '*' });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/Refusing to start/);
    expect(message).toMatch(/JWT_SECRET/);
    expect(message).toMatch(/ENCRYPTION_KEY/);
    expect(message).toMatch(/CORS_ORIGIN/);
    expect(message).not.toContain('short-secret');
  });

  describe('CORS_ORIGIN', () => {
    it('rejects * in production, including inside a list', () => {
      expect(() => validateEnv({ ...validEnv(), CORS_ORIGIN: '*' })).toThrow(/CORS_ORIGIN=\*/);
      expect(() => validateEnv({ ...validEnv(), CORS_ORIGIN: 'https://a.example.com, *' })).toThrow(
        /CORS_ORIGIN=\*/,
      );
    });

    it('allows * outside production, an explicit list, or nothing', () => {
      expect(() =>
        validateEnv({ ...validEnv(), NODE_ENV: 'development', CORS_ORIGIN: '*' }),
      ).not.toThrow();
      expect(() =>
        validateEnv({ ...validEnv(), CORS_ORIGIN: 'https://a.example.com,https://b.example.com' }),
      ).not.toThrow();
      expect(() => validateEnv({ ...validEnv(), CORS_ORIGIN: '' })).not.toThrow();
    });
  });

  it('never accepts .env.example as shipped (copying it unchanged must not boot)', () => {
    const text = readFileSync(resolve(__dirname, '../../../../.env.example'), 'utf8');
    const env: Record<string, unknown> = {};
    for (const line of text.split(/\r?\n/)) {
      const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
      if (match) env[match[1]] = match[2];
    }
    expect(env.JWT_SECRET).toBeDefined();
    expect(() => validateEnv(env)).toThrow(/Refusing to start/);
  });
});

describe('secretProblem', () => {
  it('returns null for a strong secret', () => {
    expect(secretProblem(strong('ok'))).toBeNull();
  });

  it('flags unset values', () => {
    expect(secretProblem(undefined)).toBe('is not set');
    expect(secretProblem('')).toBe('is not set');
  });
});
