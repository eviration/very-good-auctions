import { useMsal, useIsAuthenticated } from '@azure/msal-react'
import { loginRequest, tokenRequest } from './authConfig'

export function useAuth() {
  const { instance, accounts, inProgress } = useMsal()
  const isAuthenticated = useIsAuthenticated()

  const login = async () => {
    try {
      await instance.loginRedirect(loginRequest)
    } catch (error) {
      console.error('Login failed:', error)
      throw error
    }
  }

  const logout = async () => {
    try {
      await instance.logoutRedirect({
        postLogoutRedirectUri: window.location.origin,
      })
    } catch (error) {
      console.error('Logout failed:', error)
      throw error
    }
  }

  const getAccessToken = async (): Promise<string | null> => {
    if (!isAuthenticated || accounts.length === 0) {
      return null
    }

    try {
      const response = await instance.acquireTokenSilent({
        ...tokenRequest,
        account: accounts[0],
      })
      return response.accessToken
    } catch (error) {
      console.error('Token acquisition failed:', error)
      // If silent token acquisition fails, trigger interactive login
      try {
        await instance.acquireTokenRedirect(tokenRequest)
        return null // Redirect doesn't return a value
      } catch (interactiveError) {
        console.error('Interactive token acquisition failed:', interactiveError)
        return null
      }
    }
  }

  // Extract user info including profile picture from ID token claims
  const user = accounts.length > 0 ? {
    id: accounts[0].localAccountId,
    email: accounts[0].username,
    name: accounts[0].name || accounts[0].username,
    // Profile picture URL comes from the 'picture' claim in the ID token
    // This is populated by social identity providers (Google, Facebook, etc.)
    picture: (accounts[0].idTokenClaims as Record<string, unknown>)?.picture as string | undefined,
  } : null

  return {
    isAuthenticated,
    isLoading: inProgress !== 'none',
    user,
    login,
    logout,
    getAccessToken,
  }
}
