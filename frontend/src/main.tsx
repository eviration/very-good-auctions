import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { MsalProvider } from '@azure/msal-react'
import { PublicClientApplication } from '@azure/msal-browser'
import { msalConfig } from './auth/authConfig'
import App from './App'
import './index.css'

// Initialize MSAL instance
const msalInstance = new PublicClientApplication(msalConfig)

// Wait for MSAL to initialize and handle any pending redirects before rendering
msalInstance.initialize().then(async () => {
  // Handle redirect promise BEFORE rendering the app
  // This is critical for pages that receive the redirect (like invitation page)
  try {
    const response = await msalInstance.handleRedirectPromise()
    if (response) {
      console.log('MSAL redirect handled successfully in main.tsx')
      // Navigate to the return URL if we're on the callback page
      const returnUrl = sessionStorage.getItem('returnUrl')
      if (returnUrl && window.location.pathname === '/auth/callback') {
        sessionStorage.removeItem('returnUrl')
        window.location.replace(returnUrl)
        return // Don't render the app yet, we're navigating away
      }
    }
  } catch (error) {
    console.error('Error handling MSAL redirect:', error)
  }

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <MsalProvider instance={msalInstance}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </MsalProvider>
    </React.StrictMode>,
  )
})
