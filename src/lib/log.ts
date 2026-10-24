/**
 * Minimal structured logger.
 *
 * Rules:
 *  - one JSON object per line (works with Vercel/host log drains);
 *  - never log request headers, tokens, cookies or full upstream bodies;
 *  - a redaction pass runs over every field name as a last line of defence.
 */

const REDACTED = '[redacted]';
const SENSITIVE_KEY = /token|secret|authorization|cookie|password|api[-_]?key/i;

export type LogLevel = 'info' | 'warn' | 'error';

function redact(fields: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (SENSITIVE_KEY.test(key)) {
      safe[key] = REDACTED;
    } else if (value instanceof Error) {
      safe[key] = { name: value.name, message: value.message };
    } else if (value instanceof Date) {
      safe[key] = value.toISOString();
    } else {
      safe[key] = value;
    }
  }
  return safe;
}

export function logEvent(level: LogLevel, event: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({
    level,
    event,
    timestamp: new Date().toISOString(),
    ...redact(fields),
  });

  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export type Logger = typeof logEvent;

export const silentLogger: Logger = () => {};
