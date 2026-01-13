/**
 * Logger utility with token redaction
 */

const SENSITIVE_KEYS = [
  'access_token',
  'accessToken',
  'refresh_token',
  'refreshToken',
  'id_token',
  'idToken',
  'authorization',
  'Authorization',
  'api_key',
  'apiKey',
  'secret',
  'password',
  'token',
];

let debugMode = false;

export function setDebugMode(enabled: boolean): void {
  debugMode = enabled;
}

export function isDebugMode(): boolean {
  return debugMode;
}

/**
 * Redact sensitive values from an object
 */
export function redact(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(redact);
  }

  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.some((k) => key.toLowerCase().includes(k.toLowerCase()))) {
        result[key] = '[REDACTED]';
      } else if (typeof value === 'object') {
        result[key] = redact(value);
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  return obj;
}

/**
 * Log debug message (only in debug mode)
 */
export function debug(message: string, data?: unknown): void {
  if (!debugMode) return;

  const timestamp = new Date().toISOString();
  console.error(`[DEBUG ${timestamp}] ${message}`);
  if (data !== undefined) {
    console.error(JSON.stringify(redact(data), null, 2));
  }
}

/**
 * Log info message
 */
export function info(message: string): void {
  console.log(message);
}

/**
 * Log warning message
 */
export function warn(message: string): void {
  console.error(`⚠️  ${message}`);
}

/**
 * Log error message
 */
export function error(message: string, err?: unknown): void {
  console.error(`❌ ${message}`);
  if (debugMode && err) {
    console.error(redact(err));
  }
}
