import 'server-only';
import { HttpError } from '../errors/http-error';
import { toExpectedDatabaseHttpError } from '../errors/database-error';

export type PostgrestError = {
  code?: string;
  message?: string;
  detail?: string;
  details?: string;
  hint?: string;
};

export type DatabaseClient = {
  rpc<T>(functionName: string, parameters: Record<string, unknown>): Promise<T>;
};

async function parseJsonBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function asPostgrestError(value: unknown): PostgrestError | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  const stringField = (name: keyof PostgrestError) => typeof candidate[name] === 'string' ? candidate[name] : undefined;
  return {
    code: stringField('code'),
    message: stringField('message'),
    detail: stringField('detail'),
    details: stringField('details'),
    hint: stringField('hint'),
  };
}

export function createDatabaseClient(environment = process.env): DatabaseClient {
  const url = environment.SUPABASE_URL;
  const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for database access');

  return {
    async rpc<T>(functionName: string, parameters: Record<string, unknown>) {
      const response = await fetch(`${url.replace(/\/$/, '')}/rest/v1/rpc/${functionName}`, {
        method: 'POST',
        headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(parameters),
      });
      const body = await parseJsonBody(response);
      if (!response.ok) throw toExpectedDatabaseHttpError(asPostgrestError(body)) ?? new HttpError(503, 'DATABASE_UNAVAILABLE', 'Layanan data sedang tidak tersedia. Silakan coba lagi.');
      return body as T;
    },
  };
}
