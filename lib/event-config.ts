import { z } from 'zod';

const publicEventSchema = z.object({
  NEXT_PUBLIC_EVENT_ID: z.string().uuid(),
  NEXT_PUBLIC_EVENT_SLUG: z.string().trim().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
});

export type PublicEventConfig = { eventId: string; eventSlug: string };

export function getPublicEventConfig(environment: Partial<Record<string, string | undefined>> = process.env): PublicEventConfig {
  const result = publicEventSchema.safeParse(environment);
  if (!result.success) throw new Error('NEXT_PUBLIC_EVENT_ID and NEXT_PUBLIC_EVENT_SLUG must be configured for this event.');
  return { eventId: result.data.NEXT_PUBLIC_EVENT_ID, eventSlug: result.data.NEXT_PUBLIC_EVENT_SLUG };
}

export const getParticipantEventConfig = getPublicEventConfig;
