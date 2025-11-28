import { Request, Response, NextFunction } from 'express'

export function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const start = Date.now()

  res.on('finish', () => {
    const duration = Date.now() - start
    const logData = {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: `${duration}ms`,
      userAgent: req.get('user-agent'),
      ip: req.ip,
    }

    if (res.statusCode >= 400) {
      console.error('Request:', logData)
    } else if (process.env.NODE_ENV !== 'production') {
      console.log('Request:', logData)
    }
  })

  next()
}
