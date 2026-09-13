const sensitiveKey = /(email|token|secret|password|authorization|cookie|signature|url|api.?key)/i;
const sensitiveValue = /(https?:\/\/|x-amz-|bearer\b|access[\s_-]*token\b|token\b|secret\b|password\b|authorization\b|cookie\b|signature\b|api[\s_-]*key\b)/i;

function redactValue(value: unknown, seen: WeakSet<object>): unknown {
  if (typeof value === 'string') return sensitiveValue.test(value) ? '[REDACTED]' : value;
  if (value instanceof Error) return '[REDACTED]';
  if (Array.isArray(value)) return value.map((entry) => redactValue(entry, seen));
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return '[REDACTED]';
  seen.add(value);
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, sensitiveKey.test(key) ? '[REDACTED]' : redactValue(entry, seen)]));
}

export function redactLogFields(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, sensitiveKey.test(key) ? '[REDACTED]' : redactValue(value, new WeakSet())]));
}

export function safeLog(event: string, fields: Record<string, unknown> = {}): void {
  console.info(JSON.stringify({ event, ...redactLogFields(fields) }));
}
