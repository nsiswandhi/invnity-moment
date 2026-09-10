import { describe, expect, it } from 'vitest';

import { resolveQuotaIntegrationConfig } from './quota.integration.config';

const integrationConfig = resolveQuotaIntegrationConfig(process.env);
const localDatabaseAvailable = integrationConfig.kind === 'ready';
const integrationSkipReason = integrationConfig.kind === 'skip' ? integrationConfig.reason : undefined;

function localConfig(): Extract<typeof integrationConfig, { kind: 'ready' }> {
  if (integrationConfig.kind !== 'ready') {
    throw new Error(`Quota integration is not configured: ${integrationConfig.reason}`);
  }
  return integrationConfig;
}

async function request(path: string, body: unknown, method = 'POST'): Promise<unknown> {
  const config = localConfig();
  const response = await fetch(`${config.supabaseUrl}${path}`, {
    method,
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${response.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function rpc(functionName: string, parameters: Record<string, unknown>): Promise<unknown> {
  return request(`/rest/v1/rpc/${functionName}`, parameters);
}

async function expectRpcReadinessError(
  functionName: string,
  parameters: Record<string, unknown>,
  expectedMessage: string,
): Promise<void> {
  const config = localConfig();
  const response = await fetch(`${config.supabaseUrl}/rest/v1/rpc/${functionName}`, {
    method: 'POST',
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(parameters),
  });
  const text = await response.text();
  let errorMessage: string | undefined;
  try {
    const responseBody = JSON.parse(text) as { message?: unknown };
    errorMessage = typeof responseBody.message === 'string' ? responseBody.message : undefined;
  } catch {
    errorMessage = undefined;
  }

  if (response.ok || errorMessage !== expectedMessage) {
    throw new Error(
      `Quota migration/RPC readiness check failed for ${functionName}; expected ${expectedMessage}, received ${response.status}: ${text}`,
    );
  }
}

async function assertQuotaMigrationRpcReadiness(): Promise<void> {
  const participantId = crypto.randomUUID();
  const eventId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  await expectRpcReadinessError('reserve_moment_slot', {
    p_participant_id: participantId,
    p_event_id: eventId,
    p_reservation_id: crypto.randomUUID(),
    p_expires_at: expiresAt,
  }, 'PARTICIPANT_NOT_FOUND');
  await expectRpcReadinessError('complete_moment', {
    p_moment_id: crypto.randomUUID(),
    p_metadata: {},
  }, 'MOMENT_NOT_FOUND');
}

async function cleanupEventData(eventId: string): Promise<void> {
  const cleanupSteps = [
    ['upload reservations', `/rest/v1/upload_reservations?event_id=eq.${eventId}`],
    ['moments', `/rest/v1/moments?event_id=eq.${eventId}`],
    ['participants', `/rest/v1/participants?event_id=eq.${eventId}`],
    ['event', `/rest/v1/events?id=eq.${eventId}`],
  ] as const;
  const failures: string[] = [];

  for (const [recordType, path] of cleanupSteps) {
    try {
      await request(path, undefined, 'DELETE');
    } catch (error) {
      failures.push(`${recordType}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(`Quota integration cleanup failed: ${failures.join('; ')}`);
  }
}

describe.skipIf(!localDatabaseAvailable)(
  `quota migration integration${integrationSkipReason ? ` (skipped: ${integrationSkipReason})` : ''}`,
  () => {
    it('runs migrated RPCs and admits only one real concurrent reservation at 9/10', async () => {
      await assertQuotaMigrationRpcReadiness();

      const eventId = crypto.randomUUID();
      const participantId = crypto.randomUUID();
      const runId = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

      try {
        await request('/rest/v1/events', {
          id: eventId, slug: `quota-integration-${runId}`, name: 'Quota integration', event_date: '2026-10-10', status: 'live',
          max_participants: 500, max_active_moments_per_participant: 10,
        });
        const participants = await request('/rest/v1/participants', {
          id: participantId, event_id: eventId, name: 'Quota participant', batch: 'IA 5', email: `Quota.${runId}@EXAMPLE.TEST`,
          consent_version: 'test', consented_at: new Date().toISOString(),
        }) as Array<{ email: string }>;
        expect(participants[0]?.email).toBe(`quota.${runId}@example.test`);

        await request('/rest/v1/moments', Array.from({ length: 9 }, (_, index) => ({
          id: crypto.randomUUID(), event_id: eventId, participant_id: participantId, status: 'PUBLISHED', category: 'REUNI',
          r2_original_key: `integration/${index}/original.jpg`, r2_display_key: null, r2_thumbnail_key: null, mime_type: 'image/jpeg',
          byte_size: 100, width: 10, height: 20, published_at: new Date().toISOString(),
        })));

        const results = await Promise.allSettled([
          rpc('reserve_moment_slot', { p_participant_id: participantId, p_event_id: eventId, p_reservation_id: crypto.randomUUID(), p_expires_at: expiresAt }),
          rpc('reserve_moment_slot', { p_participant_id: participantId, p_event_id: eventId, p_reservation_id: crypto.randomUUID(), p_expires_at: expiresAt }),
        ]);

        expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
        expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
      } finally {
        await cleanupEventData(eventId);
      }
    });
  },
);
