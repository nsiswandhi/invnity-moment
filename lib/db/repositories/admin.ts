import 'server-only';
import { createDatabaseClient, type DatabaseClient } from '../client';
import { HttpError } from '../../errors/http-error';
import type { MomentCategory } from '../types';
import type { AdminUser } from '../../auth/admin';

export type EventMode = 'live' | 'maintenance' | 'archived';
export type EventRecord = { id: string; slug: string; name: string; eventDate: string; status: 'pre_event' | EventMode };
export type AdminMetrics = { participants: number; moments: number; published: number; hidden: number };
export type AdminActivity = { id: string; at: string; label: string; kind: 'upload' | 'moderation' };
export type AdminSummary = { event: EventRecord; metrics: AdminMetrics; activity: AdminActivity[] };
export type AdminMoment = { id: string; category: MomentCategory | null; status: 'PUBLISHED' | 'HIDDEN'; createdAt: string; publishedAt: string | null; hiddenAt: string | null; hiddenReason: string | null; participantName: string; participantBatch: string };
export type AdminParticipant = { id: string; name: string; batch: string; momentCount: number; registeredAt: string };

export type AdminRepository = {
  getActiveAdminByEmail(email: string): Promise<AdminUser | null>;
  getSummary(eventId: string): Promise<AdminSummary | null>;
  listMoments(input: { eventId: string; visibility: 'recent' | 'hidden'; limit: number }): Promise<AdminMoment[]>;
  listParticipants(input: { eventId: string; query: string | null; batch: string | null; limit: number }): Promise<AdminParticipant[]>;
  hideMoment(adminId: string, momentId: string, reason: string): Promise<void>;
  unhideMoment(adminId: string, momentId: string): Promise<void>;
  setEventMode(eventId: string, mode: EventMode): Promise<EventRecord>;
  databaseHealth(): Promise<void>;
  errorRate(eventId: string): Promise<{ errorRate: number | null; sampleSize: number }>;
};

let configuredRepository: AdminRepository | undefined;

function requireReason(reason: string): string {
  const normalized = reason.trim();
  if (!normalized) throw new HttpError(400, 'MODERATION_REASON_REQUIRED', 'Alasan menyembunyikan foto perlu diisi.');
  if (normalized.length > 500) throw new HttpError(400, 'MODERATION_REASON_INVALID', 'Alasan moderasi terlalu panjang.');
  return normalized;
}

export function createAdminRepository(client: DatabaseClient): AdminRepository {
  return {
    getActiveAdminByEmail(email) { return client.rpc<AdminUser | null>('get_active_admin_user_by_email', { p_email: email }); },
    getSummary(eventId) { return client.rpc<AdminSummary | null>('get_admin_dashboard_summary', { p_event_id: eventId }); },
    listMoments(input) { return client.rpc<AdminMoment[]>('list_admin_moments', { p_event_id: input.eventId, p_visibility: input.visibility, p_limit: input.limit }); },
    listParticipants(input) { return client.rpc<AdminParticipant[]>('list_admin_participants', { p_event_id: input.eventId, p_query: input.query, p_batch: input.batch, p_limit: input.limit }); },
    async hideMoment(adminId, momentId, reason) {
      await client.rpc<void>('set_admin_moment_visibility', { p_admin_user_id: adminId, p_moment_id: momentId, p_visibility: 'hidden', p_reason: requireReason(reason) });
    },
    async unhideMoment(adminId, momentId) {
      await client.rpc<void>('set_admin_moment_visibility', { p_admin_user_id: adminId, p_moment_id: momentId, p_visibility: 'published', p_reason: null });
    },
    setEventMode(eventId, mode) { return client.rpc<EventRecord>('set_admin_event_mode', { p_event_id: eventId, p_mode: mode }); },
    async databaseHealth() { await client.rpc<void>('admin_database_health_check', {}); },
    errorRate(eventId) { return client.rpc<{ errorRate: number | null; sampleSize: number }>('get_admin_error_rate', { p_event_id: eventId }); },
  };
}

function repository(): AdminRepository {
  if (!configuredRepository) configuredRepository = createAdminRepository(createDatabaseClient());
  return configuredRepository;
}

export function configureAdminRepository(value: AdminRepository | undefined): void { configuredRepository = value; }
export function getAdminByEmail(email: string): Promise<AdminUser | null> { return repository().getActiveAdminByEmail(email); }
export function getAdminSummary(eventId: string): Promise<AdminSummary | null> { return repository().getSummary(eventId); }
export function listAdminMoments(input: { eventId: string; visibility: 'recent' | 'hidden'; limit: number }): Promise<AdminMoment[]> { return repository().listMoments(input); }
export function listAdminParticipants(input: { eventId: string; query: string | null; batch: string | null; limit: number }): Promise<AdminParticipant[]> { return repository().listParticipants(input); }
export async function hideMoment(adminId: string, momentId: string, reason: string): Promise<void> {
  const normalizedReason = requireReason(reason);
  await repository().hideMoment(adminId, momentId, normalizedReason);
}
export function unhideMoment(adminId: string, momentId: string): Promise<void> { return repository().unhideMoment(adminId, momentId); }
export function setEventMode(eventId: string, mode: EventMode): Promise<EventRecord> { return repository().setEventMode(eventId, mode); }
export function checkAdminDatabase(): Promise<void> { return repository().databaseHealth(); }
export function getAdminErrorRate(eventId: string): Promise<{ errorRate: number | null; sampleSize: number }> { return repository().errorRate(eventId); }
