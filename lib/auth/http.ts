import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { HttpError } from '../errors/http-error';
import { toExpectedDatabaseHttpError } from '../errors/database-error';

export function requestId(): string { return randomUUID(); }
export function apiError(error: unknown, id = requestId()): NextResponse {
  if (error instanceof HttpError) return NextResponse.json({ error: { code: error.code, message: error.publicMessage }, request_id: id }, { status: error.status });
  if (error instanceof ZodError) return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'Data pendaftaran belum lengkap atau tidak valid.' }, request_id: id }, { status: 400 });
  const databaseError = toExpectedDatabaseHttpError(error);
  if (databaseError) return NextResponse.json({ error: { code: databaseError.code, message: databaseError.publicMessage }, request_id: id }, { status: databaseError.status });
  return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Terjadi gangguan. Silakan coba lagi.' }, request_id: id }, { status: 500 });
}
