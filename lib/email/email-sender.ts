import 'server-only';

export type RecoveryEmail = { to: string; recoveryUrl: string };
export type EmailSender = { sendRecoveryEmail(message: RecoveryEmail): Promise<void> };

let sender: EmailSender | undefined;

export function configureEmailSender(value: EmailSender): void {
  sender = value;
}

export async function sendRecoveryEmail(message: RecoveryEmail): Promise<void> {
  if (!sender) {
    const { SmtpEmailSender } = await import('./smtp-email-sender');
    sender = SmtpEmailSender.fromEnvironment();
  }
  await sender.sendRecoveryEmail(message);
}
