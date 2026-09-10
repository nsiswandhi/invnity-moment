'use client';

export const CLIENT_EVENT_NAMES = [
  'qr_landing', 'registration_started', 'registration_completed', 'camera_opened', 'permission_result', 'capture', 'retake',
  'category_selected', 'upload_started', 'upload_succeeded', 'upload_failed', 'upload_retried', 'moment_published',
  'moment_deleted', 'gallery_view', 'recovery_requested', 'recovery_completed', 'sponsor_module_view', 'sponsor_cta_click',
] as const;
export type ClientEventName = (typeof CLIENT_EVENT_NAMES)[number];
export type ClientEventProperty = string | number | boolean;

const allowedProperties = new Set(['category', 'destination', 'facingMode', 'permission', 'status', 'reason', 'retryCount', 'source']);

export function sanitizeClientEventProperties(properties: Record<string, unknown> = {}): Record<string, ClientEventProperty> {
  return Object.fromEntries(Object.entries(properties).filter(([key, value]) => allowedProperties.has(key) && ['string', 'number', 'boolean'].includes(typeof value))) as Record<string, ClientEventProperty>;
}

export function trackClientEvent(name: ClientEventName, properties: Record<string, unknown> = {}): void {
  const payload = JSON.stringify({ name, properties: sanitizeClientEventProperties(properties) });
  try {
    const body = new Blob([payload], { type: 'application/json' });
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function' && navigator.sendBeacon('/api/v1/analytics/events', body)) return;
    if (typeof fetch === 'function') void fetch('/api/v1/analytics/events', { method: 'POST', body, keepalive: true, headers: { 'content-type': 'application/json' } }).catch(() => undefined);
  } catch { /* Analytics must never interrupt the participant journey. */ }
}
