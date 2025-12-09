import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'

/**
 * Custom Authentication Extension for Microsoft Entra External ID
 *
 * This function handles the OnTokenIssuanceStart event, which is triggered
 * just before a token is issued to an application. It allows us to:
 * 1. Read claims from the incoming authentication (including from social providers)
 * 2. Add custom claims to the outgoing token
 *
 * Specifically, we use this to pass the 'picture' claim from social identity
 * providers (Google, Facebook, Apple) through to our application.
 */

// Request body structure from Entra External ID
interface TokenIssuanceStartRequest {
  type: string
  source: string
  data: {
    '@odata.type': string
    tenantId: string
    authenticationEventListenerId: string
    customAuthenticationExtensionId: string
    authenticationContext: {
      correlationId: string
      client: {
        ip: string
        locale: string
        market: string
      }
      protocol: string
      clientServicePrincipal: {
        id: string
        appId: string
        appDisplayName: string
        displayName: string
      }
      resourceServicePrincipal: {
        id: string
        appId: string
        appDisplayName: string
        displayName: string
      }
      user: {
        companyName: string
        createdDateTime: string
        displayName: string
        givenName: string
        id: string
        mail: string
        onPremisesSamAccountName: string
        onPremisesSecurityIdentifier: string
        preferredLanguage: string
        surname: string
        userPrincipalName: string
        userType: string
      }
    }
    // Claims from the identity provider
    claims?: Record<string, unknown>
  }
}

// Response structure expected by Entra External ID
interface TokenIssuanceStartResponse {
  data: {
    '@odata.type': string
    actions: Array<{
      '@odata.type': string
      claims: Record<string, string>
    }>
  }
}

export async function tokenIssuanceStart(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log('TokenIssuanceStart function triggered')

  try {
    const body = await request.json() as TokenIssuanceStartRequest

    context.log('Request type:', body.type)
    context.log('User:', body.data?.authenticationContext?.user?.displayName)
    context.log('User ID:', body.data?.authenticationContext?.user?.id)

    // Log available claims for debugging
    if (body.data?.claims) {
      context.log('Available claims:', JSON.stringify(body.data.claims, null, 2))
    }

    // Extract picture URL from various possible claim names
    // Different providers use different claim names for the profile picture
    const claims = body.data?.claims || {}

    // Try various claim names for profile picture
    const pictureUrl =
      claims['picture'] as string ||           // Google, standard OIDC
      claims['photo'] as string ||              // Some providers
      claims['picture_url'] as string ||        // Alternative naming
      claims['avatar'] as string ||             // Alternative naming
      claims['avatar_url'] as string ||         // Alternative naming
      claims['profile_picture'] as string ||    // Alternative naming
      claims['image'] as string ||              // Facebook sometimes
      claims['thumbnail'] as string ||          // Alternative naming
      null

    context.log('Extracted picture URL:', pictureUrl)

    // Build the response with custom claims
    const customClaims: Record<string, string> = {}

    if (pictureUrl) {
      // Add the picture URL as a custom claim
      customClaims['picture'] = pictureUrl
      context.log('Adding picture claim to token:', pictureUrl)
    }

    // You can add additional custom claims here if needed
    // For example, to indicate which identity provider was used:
    if (claims['idp'] || claims['identityProvider']) {
      customClaims['idp'] = (claims['idp'] || claims['identityProvider']) as string
    }

    const response: TokenIssuanceStartResponse = {
      data: {
        '@odata.type': 'microsoft.graph.onTokenIssuanceStartResponseData',
        actions: [
          {
            '@odata.type': 'microsoft.graph.tokenIssuanceStart.provideClaimsForToken',
            claims: customClaims
          }
        ]
      }
    }

    context.log('Returning response with claims:', JSON.stringify(customClaims))

    return {
      status: 200,
      jsonBody: response,
      headers: {
        'Content-Type': 'application/json'
      }
    }
  } catch (error) {
    context.error('Error processing token issuance request:', error)

    // Return empty claims on error - don't block authentication
    return {
      status: 200,
      jsonBody: {
        data: {
          '@odata.type': 'microsoft.graph.onTokenIssuanceStartResponseData',
          actions: [
            {
              '@odata.type': 'microsoft.graph.tokenIssuanceStart.provideClaimsForToken',
              claims: {}
            }
          ]
        }
      },
      headers: {
        'Content-Type': 'application/json'
      }
    }
  }
}

// Register the function with Azure Functions runtime
app.http('tokenIssuanceStart', {
  methods: ['POST'],
  authLevel: 'anonymous', // Entra handles authentication via the custom extension configuration
  handler: tokenIssuanceStart
})
