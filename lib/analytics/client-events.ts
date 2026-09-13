'use client';
import { type AnalyticsEventName, sanitizeAnalyticsProperties } from './event-schema';

export type ClientEventName = AnalyticsEventName;
export const sanitizeClientEventProperties = sanitizeAnalyticsProperties;

const emittedEventKeys = new Set<string>();

export function trackClientEvent(name: ClientEventName, properties: Record<string, unknown> = {}): Promise<boolean> {
  const payload = JSON.stringify({ name, properties: sanitizeAnalyticsProperties(properties) });
  try {
    const body = new Blob([payload], { type: 'application/json' });
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function' && navigator.sendBeacon('/api/v1/analytics', body)) return Promise.resolve(true);
    if (typeof fetch !== 'function') return Promise.resolve(false);
    return fetch('/api/v1/analytics', { method: 'POST', body, keepalive: true, headers: { 'content-type': 'application/json' } }).then((response) => response.ok).catch(() => false);
  } catch { /* Analytics must never interrupt the participant journey. */ return Promise.resolve(false); }
}

export function trackClientEventOnce(key: string, name: ClientEventName, properties: Record<string, unknown> = {}): Promise<boolean> {
  if (emittedEventKeys.has(key)) return Promise.resolve(false);
  emittedEventKeys.add(key);
  return trackClientEvent(name, properties).then((accepted) => {
    if (!accepted) emittedEventKeys.delete(key);
    return accepted;
  });
}
