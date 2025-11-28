import { Request, Response, NextFunction } from 'express'

export interface ApiError extends Error {
  statusCode?: number
  code?: string
  details?: Record<string, unknown>
}

export function errorHandler(
  err: ApiError,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error('Error:', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  })

  const statusCode = err.statusCode || 500
  const message = statusCode === 500 ? 'Internal server error' : err.message

  res.status(statusCode).json({
    error: {
      code: err.code || 'INTERNAL_ERROR',
      message,
      ...(err.details && { details: err.details }),
    },
  })
}

export function createError(
  statusCode: number,
  message: string,
  code?: string,
  details?: Record<string, unknown>
): ApiError {
  const error = new Error(message) as ApiError
  error.statusCode = statusCode
  error.code = code
  error.details = details
  return error
}

export function notFound(message: string = 'Resource not found'): ApiError {
  return createError(404, message, 'NOT_FOUND')
}

export function badRequest(message: string, details?: Record<string, unknown>): ApiError {
  return createError(400, message, 'BAD_REQUEST', details)
}

export function unauthorized(message: string = 'Unauthorized'): ApiError {
  return createError(401, message, 'UNAUTHORIZED')
}

export function forbidden(message: string = 'Forbidden'): ApiError {
  return createError(403, message, 'FORBIDDEN')
}
