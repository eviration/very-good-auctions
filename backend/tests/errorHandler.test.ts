import { describe, it, expect } from 'vitest'
import { createError, notFound, badRequest, unauthorized, forbidden } from '../src/middleware/errorHandler'

describe('Error Handler Utilities', () => {
  describe('createError', () => {
    it('should create an error with statusCode and message', () => {
      const error = createError(400, 'Bad request')
      expect(error.statusCode).toBe(400)
      expect(error.message).toBe('Bad request')
    })

    it('should include optional code', () => {
      const error = createError(400, 'Bad request', 'VALIDATION_ERROR')
      expect(error.code).toBe('VALIDATION_ERROR')
    })

    it('should include optional details', () => {
      const details = { field: 'email', issue: 'invalid format' }
      const error = createError(400, 'Bad request', 'VALIDATION_ERROR', details)
      expect(error.details).toEqual(details)
    })
  })

  describe('notFound', () => {
    it('should create a 404 error', () => {
      const error = notFound('User not found')
      expect(error.statusCode).toBe(404)
      expect(error.message).toBe('User not found')
      expect(error.code).toBe('NOT_FOUND')
    })

    it('should use default message if none provided', () => {
      const error = notFound()
      expect(error.statusCode).toBe(404)
      expect(error.message).toBe('Resource not found')
    })
  })

  describe('badRequest', () => {
    it('should create a 400 error', () => {
      const error = badRequest('Invalid input')
      expect(error.statusCode).toBe(400)
      expect(error.message).toBe('Invalid input')
      expect(error.code).toBe('BAD_REQUEST')
    })
  })

  describe('unauthorized', () => {
    it('should create a 401 error', () => {
      const error = unauthorized('Invalid token')
      expect(error.statusCode).toBe(401)
      expect(error.message).toBe('Invalid token')
      expect(error.code).toBe('UNAUTHORIZED')
    })
  })

  describe('forbidden', () => {
    it('should create a 403 error', () => {
      const error = forbidden('Access denied')
      expect(error.statusCode).toBe(403)
      expect(error.message).toBe('Access denied')
      expect(error.code).toBe('FORBIDDEN')
    })
  })
})
