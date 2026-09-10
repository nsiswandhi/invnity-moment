import 'server-only';
import { connect as createTlsConnection } from 'node:tls';
import { createConnection as createTcpConnection, type Socket } from 'node:net';
import type { EmailSender, RecoveryEmail } from './email-sender';

const DEFAULT_CONNECT_TIMEOUT_MS = 10_000;
const DEFAULT_READ_TIMEOUT_MS = 10_000;

export type SmtpConfig = {
  host: string;
  port: number;
  username?: string;
  password?: string;
  from: string;
  secure: boolean;
  connectTimeoutMs?: number;
  readTimeoutMs?: number;
};

function readTimeout(value: string | undefined, fallback: number, name: string): number {
  if (!value) return fallback;
  const timeout = Number(value);
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 60_000) throw new Error(`${name} must be an integer between 1 and 60000`);
  return timeout;
}

export class SmtpEmailSender implements EmailSender {
  private readonly config: Required<SmtpConfig>;

  constructor(config: SmtpConfig) {
    if (!config.host || !Number.isInteger(config.port) || config.port < 1 || config.port > 65_535 || !config.from) throw new Error('SMTP host, port, and sender are required');
    if (Boolean(config.username) !== Boolean(config.password)) throw new Error('SMTP username and password must be configured together');
    if (!config.secure && config.username) throw new Error('SMTP credentials require smtps:// or a validated STARTTLS transport');
    this.config = {
      ...config,
      username: config.username ?? '',
      password: config.password ?? '',
      connectTimeoutMs: config.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS,
      readTimeoutMs: config.readTimeoutMs ?? DEFAULT_READ_TIMEOUT_MS,
    };
    if (!Number.isInteger(this.config.connectTimeoutMs) || this.config.connectTimeoutMs < 1 || this.config.connectTimeoutMs > 60_000) throw new Error('SMTP connection timeout must be between 1 and 60000');
    if (!Number.isInteger(this.config.readTimeoutMs) || this.config.readTimeoutMs < 1 || this.config.readTimeoutMs > 60_000) throw new Error('SMTP read timeout must be between 1 and 60000');
  }

  static fromEnvironment(environment: Record<string, string | undefined> = process.env): SmtpEmailSender {
    const rawUrl = environment.SMTP_URL;
    const from = environment.SMTP_FROM;
    if (!rawUrl || !from) throw new Error('SMTP_URL and SMTP_FROM are required to send recovery email');
    const url = new URL(rawUrl);
    if (!['smtp:', 'smtps:'].includes(url.protocol)) throw new Error('SMTP_URL must use smtp or smtps');
    return new SmtpEmailSender({
      host: url.hostname,
      port: Number(url.port || (url.protocol === 'smtps:' ? 465 : 587)),
      username: decodeURIComponent(url.username) || undefined,
      password: decodeURIComponent(url.password) || undefined,
      from,
      secure: url.protocol === 'smtps:',
      connectTimeoutMs: readTimeout(environment.SMTP_CONNECT_TIMEOUT_MS, DEFAULT_CONNECT_TIMEOUT_MS, 'SMTP_CONNECT_TIMEOUT_MS'),
      readTimeoutMs: readTimeout(environment.SMTP_READ_TIMEOUT_MS, DEFAULT_READ_TIMEOUT_MS, 'SMTP_READ_TIMEOUT_MS'),
    });
  }

  async sendRecoveryEmail(message: RecoveryEmail): Promise<void> {
    const socket = await this.connect();
    try {
      await this.command(socket, null, 220);
      await this.command(socket, 'EHLO invnity-moments', 250);
      if (this.config.username && this.config.password) {
        await this.command(socket, 'AUTH LOGIN', 334);
        await this.command(socket, Buffer.from(this.config.username).toString('base64'), 334);
        await this.command(socket, Buffer.from(this.config.password).toString('base64'), 235);
      }
      await this.command(socket, `MAIL FROM:<${this.config.from}>`, 250);
      await this.command(socket, `RCPT TO:<${message.to}>`, 250);
      await this.command(socket, 'DATA', 354);
      const body = `From: ${this.config.from}\r\nTo: ${message.to}\r\nSubject: Pulihkan akses InVnity Moments\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nGunakan tautan ini untuk memulihkan akses InVnity Moments:\r\n${message.recoveryUrl}\r\n\r\nTautan ini hanya dapat digunakan sekali dan akan segera kedaluwarsa.`;
      await this.command(socket, `${body}\r\n.`, 250);
      await this.command(socket, 'QUIT', 221);
    } finally {
      socket.destroy();
    }
  }

  private async connect(): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const socket = this.config.secure
        ? createTlsConnection({ host: this.config.host, port: this.config.port, servername: this.config.host })
        : createTcpConnection({ host: this.config.host, port: this.config.port });
      const event = this.config.secure ? 'secureConnect' : 'connect';
      const timeout = setTimeout(() => finish(new Error('SMTP connection timed out')), this.config.connectTimeoutMs);
      const finish = (error?: Error) => {
        clearTimeout(timeout);
        socket.off('error', onError);
        socket.off(event, onConnect);
        if (error) {
          socket.destroy();
          reject(error);
        } else resolve(socket);
      };
      const onError = (error: Error) => finish(error);
      const onConnect = () => finish();
      socket.once('error', onError);
      socket.once(event, onConnect);
    });
  }

  private async command(socket: Socket, command: string | null, expectedCode: number): Promise<void> {
    const response = await new Promise<string>((resolve, reject) => {
      let buffer = '';
      const timeout = setTimeout(() => { cleanup(); reject(new Error('SMTP read timed out')); }, this.config.readTimeoutMs);
      const onData = (chunk: Buffer) => {
        buffer += chunk.toString('utf8');
        if (/(?:^|\r?\n)\d{3} /.test(buffer)) { cleanup(); resolve(buffer); }
      };
      const onError = (error: Error) => { cleanup(); reject(error); };
      const onClose = () => { cleanup(); reject(new Error('SMTP connection closed')); };
      const cleanup = () => { clearTimeout(timeout); socket.off('data', onData); socket.off('error', onError); socket.off('close', onClose); };
      socket.on('data', onData); socket.once('error', onError);
      socket.once('close', onClose);
      if (command !== null) socket.write(`${command}\r\n`);
    });
    if (!response.startsWith(String(expectedCode))) throw new Error(`SMTP command failed with response ${response.slice(0, 120)}`);
  }
}
