const sensitiveKey = /(email|token|secret|password|authorization|cookie|signature|url|api.?key)/i;
const sensitiveValue = /(https?:\/\/|x-amz-|bearer\s+|token=|secret=|password=)/i;

export function redactLogFields(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, sensitiveKey.test(key) || (typeof value === 'string' && sensitiveValue.test(value)) ? '[REDACTED]' : value]));
}

export function safeLog(event: string, fields: Record<string, unknown> = {}): void {
  console.info(JSON.stringify({ event, ...redactLogFields(fields) }));
}
