import { parseCorsOrigins } from '../common/cors';

/**
 * Startup validation for secrets and CORS. Runs from ConfigModule.forRoot({ validate }), so a
 * misconfigured process refuses to boot instead of running with guessable keys.
 */

/** Values that have been published in this repository (.env.example, docs). Never acceptable. */
export const KNOWN_PUBLISHED_SECRETS: ReadonlySet<string> = new Set([
  'buildpipe-docker-jwt-secret-min-32-chars',
  'buildpipe-docker-refresh-secret-32c',
  'buildpipe-docker-encryption-key-32b==',
  'local-dev-jwt-secret-min-32-chars!!',
  'local-dev-refresh-secret-32-chars!',
  'local-dev-encryption-key-32bytes!',
  'random-string-32-chars-minimum',
  'another-random-32-char-string',
  '32-byte-base64-or-string',
]);

const MIN_SECRET_LENGTH = 32;
const MIN_DISTINCT_CHARS = 12;
const GENERATE_HINT = 'generate one with: openssl rand -base64 48';

export function secretProblem(value: string | undefined): string | null {
  if (!value) return 'is not set';
  if (/change[-_]?me/i.test(value)) return 'still contains the CHANGE_ME placeholder';
  if (KNOWN_PUBLISHED_SECRETS.has(value)) return 'is a value published in this repository';
  if (value.length < MIN_SECRET_LENGTH) {
    return `is shorter than ${MIN_SECRET_LENGTH} characters`;
  }
  if (new Set(value).size < MIN_DISTINCT_CHARS) return 'has too little variety to be random';
  return null;
}

export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const str = (key: string): string | undefined => {
    const value = config[key];
    return typeof value === 'string' && value !== '' ? value : undefined;
  };

  const problems: string[] = [];

  const required = ['JWT_SECRET', 'ENCRYPTION_KEY'] as const;
  for (const key of required) {
    const problem = secretProblem(str(key));
    if (problem) problems.push(`${key} ${problem} (${GENERATE_HINT})`);
  }

  // Not used for signing yet, but if an operator sets it, it must not be a known value.
  if (str('JWT_REFRESH_SECRET')) {
    const problem = secretProblem(str('JWT_REFRESH_SECRET'));
    if (problem) problems.push(`JWT_REFRESH_SECRET ${problem} (${GENERATE_HINT})`);
  }

  const secrets = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'ENCRYPTION_KEY']
    .map((key) => [key, str(key)] as const)
    .filter((entry): entry is readonly [string, string] => entry[1] !== undefined);
  for (let i = 0; i < secrets.length; i++) {
    for (let j = i + 1; j < secrets.length; j++) {
      if (secrets[i][1] === secrets[j][1]) {
        problems.push(`${secrets[i][0]} and ${secrets[j][0]} must not be the same value`);
      }
    }
  }

  const origins = parseCorsOrigins(str('CORS_ORIGIN'));
  if (str('NODE_ENV') === 'production' && origins.includes('*')) {
    problems.push(
      'CORS_ORIGIN=* is not allowed when NODE_ENV=production; list the allowed origins, ' +
        'comma separated, or leave it empty to disable cross-origin access',
    );
  }

  if (problems.length > 0) {
    throw new Error(
      `Refusing to start: invalid configuration\n${problems.map((p) => `  - ${p}`).join('\n')}`,
    );
  }
  return config;
}
