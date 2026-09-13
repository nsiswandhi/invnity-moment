import 'server-only';
import { createDatabaseClient, type DatabaseClient } from '../db/client';

export type FunnelSummary = {
  qrLanding: number;
  registrationStarted: number;
  registrationCompleted: number;
  cameraOpened: number;
  captures: number;
  uploadStarted: number;
  uploadSucceeded: number;
  published: number;
  galleryViews: number;
  momentDetailViews: number;
  likes: number;
  downloads: number;
  recoveryRequested: number;
  recoveryCompleted: number;
};

export type SponsorSummary = { views: number; clicks: number; ctr: number };
export type AnalyticsRepository = {
  getFunnelSummary(eventId: string): Promise<FunnelSummary>;
  getSponsorSummary(eventId: string): Promise<SponsorSummary>;
};

export function createAnalyticsRepository(client: DatabaseClient): AnalyticsRepository {
  return {
    getFunnelSummary(eventId) { return client.rpc<FunnelSummary>('get_analytics_funnel_summary', { p_event_id: eventId }); },
    getSponsorSummary(eventId) { return client.rpc<SponsorSummary>('get_sponsor_summary', { p_event_id: eventId }); },
  };
}

let configuredRepository: AnalyticsRepository | undefined;
function repository(): AnalyticsRepository {
  if (!configuredRepository) configuredRepository = createAnalyticsRepository(createDatabaseClient());
  return configuredRepository;
}

export function configureAnalyticsRepository(value: AnalyticsRepository | undefined): void { configuredRepository = value; }
export function getFunnelSummary(eventId: string): Promise<FunnelSummary> { return repository().getFunnelSummary(eventId); }
export function getSponsorSummary(eventId: string): Promise<SponsorSummary> { return repository().getSponsorSummary(eventId); }
