import { z } from 'zod';

const compact = (value: string) => value.trim().replace(/\s+/g, ' ');

const participantSchema = z.object({
  name: z.string().transform(compact).pipe(z.string().min(2).max(120)),
  batch: z.string().transform(compact).pipe(z.string().regex(/^\d{4}$/).refine((value) => Number(value) >= 1940 && Number(value) <= 2050)),
  email: z.string().transform((value) => value.trim().toLowerCase()).pipe(z.string().email().max(254)),
});

export type ParticipantInput = z.infer<typeof participantSchema>;

export function validateParticipantInput(input: unknown): ParticipantInput {
  return participantSchema.parse(input);
}

export function normalizeEmail(email: string): string {
  return z.string().email().max(254).parse(email.trim().toLowerCase());
}
