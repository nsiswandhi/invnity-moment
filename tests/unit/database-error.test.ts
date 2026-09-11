import { describe, expect, it } from 'vitest'

import { toExpectedDatabaseHttpError } from '../../lib/errors/database-error'
import { HttpError } from '../../lib/errors/http-error'

describe('database error normalization', () => {
  it.each([
    ['EVENT_WRITE_DISABLED', 409],
    ['MOMENT_NOT_AVAILABLE', 404],
  ])('maps the PostgreSQL %s domain error for safe operator/participant feedback', (message, status) => {
    expect(toExpectedDatabaseHttpError({ code: 'P0001', message })).toMatchObject({ status, code: message });
  })
  it('maps the production PostgREST INVALID_CURSOR shape to a stable 400 error', () => {
    const error = toExpectedDatabaseHttpError({
      code: 'P0001',
      message: 'INVALID_CURSOR',
    })

    expect(error).toMatchObject({
      status: 400,
      code: 'INVALID_CURSOR',
    })
  })

  it('does not reinterpret unrelated P0001 errors as invalid cursors', () => {
    expect(
      toExpectedDatabaseHttpError({
        code: 'P0001',
        message: 'UNRELATED_DOMAIN_ERROR',
      }),
    ).toBeNull()
  })

  it.each(['message', 'detail', 'details', 'hint'])('recognizes a P0001 cursor marker in %s', (field) => {
    expect(toExpectedDatabaseHttpError({
      code: 'P0001',
      message: 'Album pagination rejected',
      details: null,
      hint: null,
      [field]: 'Database raised: invalid_cursor (malformed page token)',
    })).toMatchObject({ status: 400, code: 'INVALID_CURSOR' })
  })

  it.each([
    { code: 'XX000', message: 'INVALID_CURSOR' },
    { code: 'PGRST999', message: 'Request failed', details: 'INVALID_CURSOR' },
    { code: 'INVALID_CURSOR', message: 'INVALID_CURSOR' },
    { message: 'INVALID_CURSOR' },
    new Error('INVALID_CURSOR'),
    { code: 'P0001', message: 'NOT_INVALID_CURSOR' },
    { code: 'P0001', message: 'INVALID_CURSOR_STATE' },
    { code: 'P0001', message: null, detail: 123, details: {}, hint: ['INVALID_CURSOR'] },
  ])('does not classify an unrelated error as an invalid cursor: %j', (error) => {
    expect(toExpectedDatabaseHttpError(error)).toBeNull()
  })

  it.each([
    ['PARTICIPANT_EXISTS', 409, 'RECOVERY_REQUIRED'],
    ['EVENT_NOT_FOUND', 404, 'EVENT_NOT_FOUND'],
    ['PARTICIPANT_DISABLED', 403, 'PARTICIPANT_DISABLED'],
    ['SESSION_EXPIRED', 401, 'UNAUTHENTICATED'],
    ['23505', 409, 'CONFLICT'],
    ['23503', 409, 'CONFLICT'],
    ['42501', 403, 'DATABASE_FORBIDDEN'],
    ['EVENT_ARCHIVED', 409, 'EVENT_ARCHIVED'],
    ['MOMENT_NOT_AVAILABLE', 404, 'MOMENT_NOT_AVAILABLE'],
    ['INVALID_MOMENT_CATEGORY', 400, 'INVALID_MOMENT_CATEGORY'],
    ['INVALID_LIKE_IDENTITY', 400, 'INVALID_LIKE_IDENTITY'],
  ])('preserves the existing %s mapping even with cursor text', (identifier, status, code) => {
    expect(toExpectedDatabaseHttpError({ code: identifier, message: 'INVALID_CURSOR' }))
      .toMatchObject({ status, code })
    expect(toExpectedDatabaseHttpError({ message: identifier }))
      .toMatchObject({ status, code })
  })

  it('preserves an already mapped HttpError', () => {
    const error = new HttpError(400, 'INVALID_CURSOR', 'Invalid page')
    expect(toExpectedDatabaseHttpError(error)).toBe(error)
  })
})
