import { describe, expect, it } from 'vitest'

import { toExpectedDatabaseHttpError } from '../../lib/errors/database-error'

describe('database error normalization', () => {
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
})
