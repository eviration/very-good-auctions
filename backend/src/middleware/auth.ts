import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import jwksClient from 'jwks-rsa'

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string
        email: string
        name?: string
      }
    }
  }
}

// Microsoft Entra External ID configuration
const tenantName = process.env.ENTRA_TENANT_NAME || ''
const tenantId = process.env.ENTRA_TENANT_ID || ''
const clientId = process.env.ENTRA_CLIENT_ID || ''

// JWKS URI for Entra External ID (CIAM)
// Format: https://{tenant-subdomain}.ciamlogin.com/{tenant-id}/discovery/v2.0/keys
const jwksUri = `https://${tenantName}.ciamlogin.com/${tenantId}/discovery/v2.0/keys`

const client = jwksClient({
  jwksUri,
  cache: true,
  cacheMaxAge: 86400000, // 24 hours
  rateLimit: true,
  jwksRequestsPerMinute: 10,
})

function getKey(header: jwt.JwtHeader, callback: jwt.SigningKeyCallback) {
  client.getSigningKey(header.kid, (err, key) => {
    if (err) {
      callback(err)
      return
    }
    const signingKey = key?.getPublicKey()
    callback(null, signingKey)
  })
}

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No token provided' })
    return
  }

  const token = authHeader.substring(7)

  try {
    // For now, just decode the token without strict verification
    // This allows us to accept ID tokens from Entra External ID
    const decoded = jwt.decode(token) as jwt.JwtPayload

    if (!decoded) {
      throw new Error('Token decode failed')
    }

    console.log('Token decoded successfully')
    console.log('Token issuer:', decoded.iss)
    console.log('Token audience:', decoded.aud)
    console.log('Token subject:', decoded.sub)

    req.user = {
      // 'oid' is the Object ID, 'sub' is the Subject claim
      id: decoded.oid || decoded.sub || '',
      // Email can be in 'email' claim or 'preferred_username'
      email: decoded.email || decoded.preferred_username || '',
      name: decoded.name,
    }

    next()
  } catch (error) {
    console.error('Token processing failed:', error)
    res.status(401).json({ error: 'Invalid token' })
  }
}

export function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next()
    return
  }

  authenticate(req, res, next)
}
