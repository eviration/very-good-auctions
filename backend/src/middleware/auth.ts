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

// Expected issuer for Entra External ID (CIAM)
const expectedIssuer = `https://${tenantName}.ciamlogin.com/${tenantId}/v2.0`

// JWKS client for fetching public keys
const client = jwksClient({
  jwksUri,
  cache: true,
  cacheMaxAge: 86400000, // 24 hours
  rateLimit: true,
  jwksRequestsPerMinute: 10,
})

// Get signing key from JWKS
function getKey(header: jwt.JwtHeader, callback: jwt.SigningKeyCallback) {
  if (!header.kid) {
    callback(new Error('No kid in token header'))
    return
  }

  client.getSigningKey(header.kid, (err, key) => {
    if (err) {
      console.error('Error fetching signing key:', err.message)
      callback(err)
      return
    }
    const signingKey = key?.getPublicKey()
    callback(null, signingKey)
  })
}

// Verify JWT token with JWKS
function verifyToken(token: string): Promise<jwt.JwtPayload> {
  return new Promise((resolve, reject) => {
    jwt.verify(
      token,
      getKey,
      {
        algorithms: ['RS256'],
        issuer: expectedIssuer,
        audience: clientId,
      },
      (err, decoded) => {
        if (err) {
          reject(err)
        } else {
          resolve(decoded as jwt.JwtPayload)
        }
      }
    )
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
    // Verify the token signature, issuer, and audience
    const decoded = await verifyToken(token)

    // Check token expiration (jwt.verify does this, but double-check)
    const now = Math.floor(Date.now() / 1000)
    if (decoded.exp && decoded.exp < now) {
      res.status(401).json({ error: 'Token expired' })
      return
    }

    // Check not-before claim
    if (decoded.nbf && decoded.nbf > now) {
      res.status(401).json({ error: 'Token not yet valid' })
      return
    }

    req.user = {
      // 'oid' is the Object ID, 'sub' is the Subject claim
      id: decoded.oid || decoded.sub || '',
      // Email can be in 'email' claim or 'preferred_username'
      email: decoded.email || decoded.preferred_username || '',
      name: decoded.name,
    }

    next()
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('Token verification failed:', errorMessage)

    // Provide specific error messages for common issues
    if (errorMessage.includes('invalid signature')) {
      res.status(401).json({ error: 'Invalid token signature' })
    } else if (errorMessage.includes('jwt expired')) {
      res.status(401).json({ error: 'Token expired' })
    } else if (errorMessage.includes('jwt audience invalid')) {
      res.status(401).json({ error: 'Invalid token audience' })
    } else if (errorMessage.includes('jwt issuer invalid')) {
      res.status(401).json({ error: 'Invalid token issuer' })
    } else {
      res.status(401).json({ error: 'Invalid token' })
    }
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
