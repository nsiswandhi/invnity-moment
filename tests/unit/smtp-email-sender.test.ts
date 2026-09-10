import { createServer, type Socket } from 'node:net';
import { describe, expect, it } from 'vitest';
import { SmtpEmailSender } from '../../lib/email/smtp-email-sender';

describe('SMTP transport security', () => {
  it('rejects plaintext SMTP credentials before it can issue AUTH', () => {
    expect(() => SmtpEmailSender.fromEnvironment({
      SMTP_URL: 'smtp://username:password@localhost:2525',
      SMTP_FROM: 'noreply@moments.example.test',
    })).toThrow(/smtps|starttls/i);
  });

  it('times out while waiting for an SMTP server response', async () => {
    let client: Socket | undefined;
    const server = createServer((socket) => { client = socket; });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected a TCP server address');
    const sender = new SmtpEmailSender({
      host: '127.0.0.1',
      port: address.port,
      from: 'noreply@moments.example.test',
      secure: false,
      connectTimeoutMs: 100,
      readTimeoutMs: 25,
    });

    try {
      await expect(sender.sendRecoveryEmail({ to: 'sari@example.test', recoveryUrl: 'https://moments.example.test/recovery?token=token' }))
        .rejects.toThrow(/timed out/i);
    } finally {
      client?.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }, 1_000);
});
