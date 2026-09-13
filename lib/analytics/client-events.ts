'use client';
import { type AnalyticsEventName, sanitizeAnalyticsProperties } from './event-schema';

export type ClientEventName = AnalyticsEventName;
export const sanitizeClientEventProperties = sanitizeAnalyticsProperties;

const emittedEventKeys = new Set<string>();

export function trackClientEvent(name: ClientEventName, properties: Record<string, unknown> = {}): void {
  const payload = JSON.stringify({ name, properties: sanitizeAnalyticsProperties(properties) });
  try {
    const body = new Blob([payload], { type: 'application/json' });
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function' && navigator.sendBeacon('/api/v1/analytics', body)) return;
    if (typeof fetch === 'function') void fetch('/api/v1/analytics', { method: 'POST', body, keepalive: true, headers: { 'content-type': 'application/json' } }).catch(() => undefined);
  } catch { /* Analytics must never interrupt the participant journey. */ }
}

export function trackClientEventOnce(key: string, name: ClientEventName, properties: Record<string, unknown> = {}): void {
  if (emittedEventKeys.has(key)) return;
  emittedEventKeys.add(key);
  trackClientEvent(name, properties);
}
