import { Configuration, LogLevel } from '@azure/msal-browser'

// Microsoft Entra External ID configuration
// This replaces the deprecated Azure AD B2C
// Replace these values with your actual Entra External ID tenant details
const tenantName = import.meta.env.VITE_AZURE_AD_TENANT_NAME || 'your-tenant'
const tenantId = import.meta.env.VITE_AZURE_AD_TENANT_ID || 'your-tenant-id'
const clientId = import.meta.env.VITE_AZURE_AD_CLIENT_ID || 'your-client-id'

// Authority URL for Entra External ID (CIAM)
// Format: https://{tenant-subdomain}.ciamlogin.com/{tenant-id}
const authorityDomain = `${tenantName}.ciamlogin.com`
const authority = `https://${authorityDomain}/${tenantId}`

export const msalConfig: Configuration = {
  auth: {
    clientId,
    authority,
    knownAuthorities: [authorityDomain],
    redirectUri: window.location.origin + '/auth/callback',
    postLogoutRedirectUri: window.location.origin,
    navigateToLoginRequestUrl: true,
  },
  cache: {
    cacheLocation: 'localStorage',
    storeAuthStateInCookie: false,
  },
  system: {
    loggerOptions: {
      loggerCallback: (level, message, containsPii) => {
        if (containsPii) return
        switch (level) {
          case LogLevel.Error:
            console.error(message)
            break
          case LogLevel.Warning:
            console.warn(message)
            break
          case LogLevel.Info:
            console.info(message)
            break
          case LogLevel.Verbose:
            console.debug(message)
            break
        }
      },
      logLevel: LogLevel.Warning,
    },
  },
}

// Scopes for API access
// These are configured in your Entra External ID app registration
export const apiScopes = {
  read: [`api://${clientId}/Read`],
  write: [`api://${clientId}/Write`],
}

// Login request configuration
export const loginRequest = {
  scopes: ['openid', 'profile', 'email', 'offline_access'],
}

// Token request for API calls
export const tokenRequest = {
  scopes: [...apiScopes.read, ...apiScopes.write],
}
