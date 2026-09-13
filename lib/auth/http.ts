import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { HttpError } from '../errors/http-error';
import { toExpectedDatabaseHttpError } from '../errors/database-error';
import { REQUEST_ID_HEADER, resolveRequestId } from '../security/request-id';
import { safeLog } from '../security/redaction';

export function requestId(request?: Request): string { return resolveRequestId(request?.headers.get(REQUEST_ID_HEADER)); }
export function apiError(error: unknown, id = requestId()): NextResponse {
  const response = (body: object, status: number) => NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: id } });
  if (error instanceof HttpError) return response({ error: { code: error.code, message: error.publicMessage }, request_id: id }, error.status);
  if (error instanceof ZodError) return response({ error: { code: 'VALIDATION_ERROR', message: 'Data pendaftaran belum lengkap atau tidak valid.' }, request_id: id }, 400);
  const databaseError = toExpectedDatabaseHttpError(error);
  if (databaseError) return response({ error: { code: databaseError.code, message: databaseError.publicMessage }, request_id: id }, databaseError.status);
  safeLog('api_error', { requestId: id, errorCode: 'UNEXPECTED' });
  return response({ error: { code: 'INTERNAL_ERROR', message: 'Terjadi gangguan. Silakan coba lagi.' }, request_id: id }, 500);
}
