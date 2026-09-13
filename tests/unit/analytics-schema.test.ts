import { describe, expect, it } from 'vitest';
import {
  ANALYTICS_EVENT_NAMES,
  parseAnalyticsEvent,
  sanitizeAnalyticsProperties,
} from '../../lib/analytics/event-schema';

describe('analytics event schema', () => {
  it('accepts every approved event name used by the event journey', () => {
    expect(ANALYTICS_EVENT_NAMES).toEqual(expect.arrayContaining([
      'qr_landing',
      'registration_started',
      'registration_completed',
      'camera_opened',
      'permission_result',
      'capture',
      'retake',
      'upload_started',
      'upload_succeeded',
      'upload_failed',
      'upload_retried',
      'moment_published',
      'gallery_view',
      'moment_detail_view',
      'moment_liked',
      'moment_downloaded',
      'recovery_requested',
      'recovery_completed',
      'sponsor_module_view',
      'sponsor_cta_click',
    ]));

    expect(parseAnalyticsEvent({ name: 'upload_succeeded', properties: { category: 'REUNI' } })).toEqual({
      name: 'upload_succeeded',
      properties: { category: 'REUNI' },
    });
  });

  it('drops personal and credential-like properties before analytics leaves the browser', () => {
    expect(sanitizeAnalyticsProperties({
      category: 'REUNI',
      retryCount: 2,
      email: 'private@example.test',
      accessToken: 'super-secret-token',
      downloadUrl: 'https://bucket.example.test/photo.jpg?X-Amz-Signature=private',
      participantName: 'Sari Wijaya',
      unknown: 'discarded',
    })).toEqual({ category: 'REUNI', retryCount: 2 });
  });

  it('rejects unknown event names instead of persisting arbitrary telemetry', () => {
    expect(() => parseAnalyticsEvent({ name: 'email_exported', properties: {} })).toThrow();
  });

  it('keeps only small, approved values when an event is parsed on the server', () => {
    expect(parseAnalyticsEvent({
      name: 'sponsor_cta_click',
      properties: {
        destination: 'google_play',
        reason: 'token=private',
        source: 'album',
        retryCount: Number.POSITIVE_INFINITY,
      },
    })).toEqual({
      name: 'sponsor_cta_click',
      properties: { destination: 'google_play', source: 'album' },
    });
  });
});
