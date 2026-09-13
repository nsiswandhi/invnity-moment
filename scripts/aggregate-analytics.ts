import { getPublicEventConfig } from '../lib/event-config';
import { getFunnelSummary, getSponsorSummary, type FunnelSummary, type SponsorSummary } from '../lib/analytics/aggregates';

export type AnalyticsAggregationSource = {
  getFunnelSummary(eventId: string): Promise<FunnelSummary>;
  getSponsorSummary(eventId: string): Promise<SponsorSummary>;
};

export type AggregateReport = {
  eventId: string;
  generatedAt: string;
  funnel: FunnelSummary;
  sponsor: SponsorSummary;
};

export async function aggregateAnalytics({ eventId = getPublicEventConfig().eventId, source = { getFunnelSummary, getSponsorSummary }, now = new Date() }: { eventId?: string; source?: AnalyticsAggregationSource; now?: Date } = {}): Promise<AggregateReport> {
  const [funnel, sponsor] = await Promise.all([source.getFunnelSummary(eventId), source.getSponsorSummary(eventId)]);
  return { eventId, generatedAt: now.toISOString(), funnel, sponsor };
}

async function main(): Promise<void> {
  process.stdout.write(`${JSON.stringify(await aggregateAnalytics())}\n`);
}

if (process.argv[1]?.endsWith('aggregate-analytics.ts')) main().catch(() => { process.stderr.write('Analytics aggregation failed.\n'); process.exitCode = 1; });
