// Runs before any test file is imported, so AppModule sees these values.
// These are throwaway test values, not real credentials.
process.env.NODE_ENV = 'production'; // avoids the pino-pretty worker thread
process.env.LOG_LEVEL = 'silent';
process.env.JWT_SECRET = 'e2e-only-jwt-secret-at-least-32-characters-long';
process.env.JWT_REFRESH_SECRET = 'e2e-only-refresh-secret-at-least-32-chars-long';
process.env.ENCRYPTION_KEY = 'e2e-only-encryption-key-at-least-32-characters';
process.env.REDIS_HOST = '127.0.0.1';
