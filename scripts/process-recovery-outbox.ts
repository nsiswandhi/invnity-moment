import { processRecoveryDeliveryOutbox } from '../lib/recovery/outbox-worker';

void processRecoveryDeliveryOutbox().then((result) => {
  process.stdout.write(`${JSON.stringify(result)}\n`);
}).catch(() => {
  process.stderr.write('Recovery outbox processing failed.\n');
  process.exitCode = 1;
});
