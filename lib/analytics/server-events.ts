import 'server-only';
import { createDatabaseClient, type DatabaseClient } from '../db/client';
import { HttpError } from '../errors/http-error';
import { parseAnalyticsEvent, type AnalyticsEventInput } from './event-schema';

export type AnalyticsEvent = AnalyticsEventInput & { eventId: string; participantId?: string | null };
export type ServerEventTracker = { track(event: AnalyticsEvent): Promise<void> };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validUuid(value: string | null | undefined): boolean { return typeof value === 'string' && uuidPattern.test(value); }

export function createServerEventTracker(client: DatabaseClient): ServerEventTracker {
  return {
    async track(event) {
      if (!validUuid(event.eventId) || (event.participantId != null && !validUuid(event.participantId))) {
        throw new HttpError(400, 'ANALYTICS_EVENT_INVALID', 'Data analitik tidak valid.');
      }
      const parsed = parseAnalyticsEvent(event);
      await client.rpc<void>('record_analytics_event', {
        p_event_id: event.eventId,
        p_participant_id: event.participantId ?? null,
        p_name: parsed.name,
        p_properties: parsed.properties,
      });
    },
  };
}

let configuredTracker: ServerEventTracker | undefined;

function tracker(): ServerEventTracker {
  if (!configuredTracker) configuredTracker = createServerEventTracker(createDatabaseClient());
  return configuredTracker;
}

export function configureServerEventTracker(value: ServerEventTracker | undefined): void { configuredTracker = value; }
export function trackServerEvent(event: AnalyticsEvent): Promise<void> { return tracker().track(event); }
