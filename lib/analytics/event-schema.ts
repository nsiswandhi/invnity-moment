export const ANALYTICS_EVENT_NAMES = [
  'qr_landing',
  'registration_started',
  'registration_completed',
  'camera_opened',
  'permission_result',
  'capture',
  'retake',
  'category_selected',
  'upload_started',
  'upload_succeeded',
  'upload_failed',
  'upload_retried',
  'moment_published',
  'moment_deleted',
  'gallery_view',
  'moment_detail_view',
  'moment_liked',
  'moment_downloaded',
  'recovery_requested',
  'recovery_completed',
  'sponsor_module_view',
  'sponsor_cta_click',
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENT_NAMES)[number];
export type AnalyticsPropertyValue = string | number | boolean;
export type AnalyticsProperties = Record<string, AnalyticsPropertyValue>;
export type AnalyticsEventInput = { name: AnalyticsEventName; properties: AnalyticsProperties };

const allowedPropertyNames = new Set([
  'category',
  'destination',
  'facingMode',
  'permission',
  'status',
  'reason',
  'retryCount',
  'source',
]);

const sensitiveValue = /(https?:\/\/|x-amz-|signature|token|secret|password|authorization|cookie|bearer)/i;

function isAnalyticsEventName(value: unknown): value is AnalyticsEventName {
  return typeof value === 'string' && (ANALYTICS_EVENT_NAMES as readonly string[]).includes(value);
}

function isSafeAnalyticsValue(value: unknown): value is AnalyticsPropertyValue {
  if (typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value) && Math.abs(value) <= 1_000_000;
  return typeof value === 'string' && value.length > 0 && value.length <= 120 && !sensitiveValue.test(value);
}

export function sanitizeAnalyticsProperties(properties: Record<string, unknown> = {}): AnalyticsProperties {
  return Object.fromEntries(Object.entries(properties).filter(([key, value]) => allowedPropertyNames.has(key) && isSafeAnalyticsValue(value))) as AnalyticsProperties;
}

export function parseAnalyticsEvent(value: unknown): AnalyticsEventInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('ANALYTICS_EVENT_INVALID');
  const candidate = value as { name?: unknown; properties?: unknown };
  if (!isAnalyticsEventName(candidate.name)) throw new Error('ANALYTICS_EVENT_INVALID');
  const properties = candidate.properties && typeof candidate.properties === 'object' && !Array.isArray(candidate.properties)
    ? sanitizeAnalyticsProperties(candidate.properties as Record<string, unknown>)
    : {};
  return { name: candidate.name, properties };
}
