import { Routes, Route } from 'react-router-dom'
import { useEffect } from 'react'
import { useMsal } from '@azure/msal-react'
import { useAuthStore } from './hooks/useAuthStore'
import { signalRService } from './services/signalr'
import { apiClient } from './services/api'
import { tokenRequest } from './auth/authConfig'

// Layout
import Header from './components/Header'
import Footer from './components/Footer'

// Pages
import HomePage from './pages/HomePage'
import AuctionDetailPage from './pages/AuctionDetailPage'
import CreateAuctionPage from './pages/CreateAuctionPage'
import MyBidsPage from './pages/MyBidsPage'
import MyAuctionsPage from './pages/MyAuctionsPage'
import ProfilePage from './pages/ProfilePage'
import HowItWorksPage from './pages/HowItWorksPage'
import NotFoundPage from './pages/NotFoundPage'

// Auth
import { AuthCallback } from './auth/AuthCallback'
import { ProtectedRoute } from './auth/ProtectedRoute'

function App() {
  const { instance, accounts } = useMsal()
  const { setUser, clearUser } = useAuthStore()

  // Configure API client with token provider
  useEffect(() => {
    apiClient.setTokenProvider(async () => {
      if (accounts.length === 0) {
        return null
      }

      try {
        const response = await instance.acquireTokenSilent({
          ...tokenRequest,
          account: accounts[0],
        })
        // Use idToken for Entra External ID (CIAM)
        // The backend validates this token and extracts user identity
        return response.idToken
      } catch (error) {
        console.error('Failed to acquire token:', error)
        return null
      }
    })
  }, [instance, accounts])

  useEffect(() => {
    if (accounts.length > 0) {
      const account = accounts[0]
      setUser({
        id: account.localAccountId,
        email: account.username,
        name: account.name || account.username,
      })

      // Connect to SignalR for real-time updates
      signalRService.connect()
    } else {
      clearUser()
      signalRService.disconnect()
    }

    return () => {
      signalRService.disconnect()
    }
  }, [accounts, setUser, clearUser])

  return (
    <div className="min-h-screen flex flex-col bg-cream">
      <Header />
      
      <main className="flex-1">
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<HomePage />} />
          <Route path="/auctions/:id" element={<AuctionDetailPage />} />
          <Route path="/how-it-works" element={<HowItWorksPage />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          
          {/* Protected routes */}
          <Route path="/auctions/create" element={
            <ProtectedRoute>
              <CreateAuctionPage />
            </ProtectedRoute>
          } />
          <Route path="/my-bids" element={
            <ProtectedRoute>
              <MyBidsPage />
            </ProtectedRoute>
          } />
          <Route path="/my-auctions" element={
            <ProtectedRoute>
              <MyAuctionsPage />
            </ProtectedRoute>
          } />
          <Route path="/profile" element={
            <ProtectedRoute>
              <ProfilePage />
            </ProtectedRoute>
          } />
          
          {/* 404 */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
      
      <Footer />
    </div>
  )
}

export default App
