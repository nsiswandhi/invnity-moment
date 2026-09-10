import { z } from 'zod';

const publicEventSlugSchema = z.string().trim().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

const publicEventSchema = z.object({
  NEXT_PUBLIC_EVENT_ID: z.string().trim().uuid(),
  NEXT_PUBLIC_EVENT_SLUG: publicEventSlugSchema,
});

const publicSlugSchema = z.object({ NEXT_PUBLIC_EVENT_SLUG: publicEventSlugSchema });

export type PublicEventConfig = { eventId: string; eventSlug: string };
type PublicEventEnvironment = Partial<Record<string, string | undefined>>;

export function getPublicEventSlug(environment: PublicEventEnvironment = process.env): string {
  const result = publicSlugSchema.safeParse(environment);
  if (!result.success) throw new Error('NEXT_PUBLIC_EVENT_SLUG must be configured for this event.');
  return result.data.NEXT_PUBLIC_EVENT_SLUG;
}

export function getPublicEventConfig(environment: PublicEventEnvironment = process.env): PublicEventConfig {
  const result = publicEventSchema.safeParse(environment);
  if (!result.success) throw new Error('NEXT_PUBLIC_EVENT_ID and NEXT_PUBLIC_EVENT_SLUG must be configured for this event.');
  return { eventId: result.data.NEXT_PUBLIC_EVENT_ID, eventSlug: result.data.NEXT_PUBLIC_EVENT_SLUG };
}

export const getParticipantEventConfig = getPublicEventConfig;
