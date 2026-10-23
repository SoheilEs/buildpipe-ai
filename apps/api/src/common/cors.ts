/** Splits CORS_ORIGIN into a list. Empty or unset means no cross-origin access. */
export function parseCorsOrigins(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter((origin) => origin !== '');
}

type OriginCallback = (error: Error | null, allow?: boolean) => void;

/**
 * Origin check for HTTP (enableCors) and the WebSocket gateway. The allowlist is read on every
 * request so it works with values that ConfigModule loads from a .env file after imports run.
 * Requests without an Origin header (same-origin, curl, server-to-server) are not CORS requests
 * and are unaffected.
 */
export function corsOriginHandler(): (
  origin: string | undefined,
  callback: OriginCallback,
) => void {
  return (origin, callback) => {
    if (!origin) return callback(null, true);
    const allowed = parseCorsOrigins(process.env.CORS_ORIGIN);
    callback(null, allowed.includes('*') || allowed.includes(origin.replace(/\/+$/, '')));
  };
}
