import { processRecoveryDeliveryOutbox } from '../../../../lib/recovery/outbox-worker';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 });
  }

  try {
    const result = await processRecoveryDeliveryOutbox({ batchSize: 10 });
    return Response.json({ data: result });
  } catch {
    return Response.json({ error: { code: 'RECOVERY_OUTBOX_FAILED', message: 'Recovery outbox processing failed.' } }, { status: 500 });
  }
}
