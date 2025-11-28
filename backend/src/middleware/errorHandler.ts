import { Request, Response, NextFunction } from 'express'

export interface ApiError extends Error {
  statusCode?: number
  code?: string
  details?: Record<string, string[]>
}

export function errorHandler(
  err: ApiError,
  req: Request,
  res: Response,
  next: NextFunction
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
  message: string,
  statusCode: number = 500,
  code?: string
): ApiError {
  const error = new Error(message) as ApiError
  error.statusCode = statusCode
  error.code = code
  return error
}

export function notFound(message: string = 'Resource not found'): ApiError {
  return createError(message, 404, 'NOT_FOUND')
}

export function badRequest(message: string, details?: Record<string, string[]>): ApiError {
  const error = createError(message, 400, 'BAD_REQUEST')
  error.details = details
  return error
}

export function unauthorized(message: string = 'Unauthorized'): ApiError {
  return createError(message, 401, 'UNAUTHORIZED')
}

export function forbidden(message: string = 'Forbidden'): ApiError {
  return createError(message, 403, 'FORBIDDEN')
}
