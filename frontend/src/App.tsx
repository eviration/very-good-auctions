import { Routes, Route } from 'react-router-dom'
import { useEffect, useRef } from 'react'
import { useMsal } from '@azure/msal-react'
import { InteractionRequiredAuthError, AuthError } from '@azure/msal-browser'
import { useAuthStore } from './hooks/useAuthStore'
import { signalRService } from './services/signalr'
import { apiClient } from './services/api'
import { tokenRequest } from './auth/authConfig'

// Layout
import Header from './components/Header'
import Footer from './components/Footer'

// Pages
import HomePage from './pages/HomePage'
import ProfilePage from './pages/ProfilePage'
import HowItWorksPage from './pages/HowItWorksPage'
import PrivacyPolicyPage from './pages/PrivacyPolicyPage'
import TermsOfServicePage from './pages/TermsOfServicePage'
import DataDeletionPage from './pages/DataDeletionPage'
import NotFoundPage from './pages/NotFoundPage'
import CreateOrganizationPage from './pages/CreateOrganizationPage'
import OrganizationDetailPage from './pages/OrganizationDetailPage'
import OrganizationDashboardPage from './pages/OrganizationDashboardPage'
import InvitationAcceptPage from './pages/InvitationAcceptPage'

// Event Pages
import MyEventsPage from './pages/MyEventsPage'
import CreateEventPage from './pages/CreateEventPage'
import EventDashboardPage from './pages/EventDashboardPage'
import EventDetailPage from './pages/EventDetailPage'
import EventItemPage from './pages/EventItemPage'
import SubmitItemPage from './pages/SubmitItemPage'
import SubmitItemSuccessPage from './pages/SubmitItemSuccessPage'
import MyWinsPage from './pages/MyWinsPage'
import MyBidsPage from './pages/MyBidsPage'
import MyItemsPage from './pages/MyItemsPage'
import MyOrganizationsPage from './pages/MyOrganizationsPage'
import TaxInformationPage from './pages/TaxInformationPage'
import FeedbackPage from './pages/FeedbackPage'
import AdminFeedbackPage from './pages/AdminFeedbackPage'
import ManageAdminsPage from './pages/ManageAdminsPage'

// Auth
import { AuthCallback } from './auth/AuthCallback'
import { ProtectedRoute } from './auth/ProtectedRoute'

function App() {
  const { instance, accounts } = useMsal()
  const { setUser, clearUser } = useAuthStore()

  // Use ref to track in-flight token requests and prevent race conditions
  const tokenPromiseRef = useRef<Promise<string | null> | null>(null)

  // Track if we're currently redirecting to prevent multiple redirects
  const isRedirectingRef = useRef(false)

  // Configure API client with token provider
  useEffect(() => {
    apiClient.setTokenProvider(async () => {
      if (accounts.length === 0) {
        return null
      }

      // If we're already redirecting to login, throw to prevent API calls
      if (isRedirectingRef.current) {
        throw new Error('Authentication in progress')
      }

      // If there's already a token request in flight, wait for it
      // This prevents multiple concurrent token acquisition attempts
      if (tokenPromiseRef.current) {
        return tokenPromiseRef.current
      }

      // Create the promise FIRST, then set the ref SYNCHRONOUSLY
      // This prevents race conditions between multiple callers
      const tokenPromise = (async (): Promise<string | null> => {
        try {
          const response = await instance.acquireTokenSilent({
            ...tokenRequest,
            account: accounts[0],
          })
          // Use idToken for Entra External ID (CIAM)
          // The backend validates this token and extracts user identity
          return response.idToken
        } catch (error) {
          console.error('Failed to acquire token silently:', error)
          console.error('Error type:', error?.constructor?.name)
          console.error('Error details:', error instanceof AuthError ? {
            errorCode: (error as AuthError).errorCode,
            errorMessage: (error as AuthError).errorMessage,
          } : 'Not an AuthError')

          // Check for any auth-related error that requires re-login
          const isAuthError = error instanceof InteractionRequiredAuthError ||
            error instanceof AuthError ||
            (error instanceof Error && (
              error.message?.includes('interaction_required') ||
              error.message?.includes('login_required') ||
              error.message?.includes('consent_required') ||
              error.message?.includes('AADSTS')
            ))

          if (isAuthError && !isRedirectingRef.current) {
            isRedirectingRef.current = true
            console.log('Auth error detected, redirecting to login...')
            // Small delay to let current render complete, then redirect
            setTimeout(() => {
              instance.loginRedirect({
                ...tokenRequest,
                prompt: 'login',
              }).catch(err => {
                console.error('Login redirect failed:', err)
                isRedirectingRef.current = false
              })
            }, 100)
            // Throw to prevent API call from proceeding without auth
            throw new Error('Session expired - redirecting to login')
          }
          // For non-auth errors, throw to surface the issue
          throw error
        } finally {
          // Clear the ref after completion
          tokenPromiseRef.current = null
        }
      })()

      // Set ref SYNCHRONOUSLY before any await
      tokenPromiseRef.current = tokenPromise
      return tokenPromise
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
          <Route path="/how-it-works" element={<HowItWorksPage />} />
          <Route path="/privacy" element={<PrivacyPolicyPage />} />
          <Route path="/terms" element={<TermsOfServicePage />} />
          <Route path="/data-deletion" element={<DataDeletionPage />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/organizations/:slug" element={<OrganizationDetailPage />} />
          <Route path="/invitations/:token" element={<InvitationAcceptPage />} />

          {/* Protected routes */}
          <Route path="/profile" element={
            <ProtectedRoute>
              <ProfilePage />
            </ProtectedRoute>
          } />
          <Route path="/organizations/new" element={
            <ProtectedRoute>
              <CreateOrganizationPage />
            </ProtectedRoute>
          } />
          <Route path="/organizations/:slug/manage" element={
            <ProtectedRoute>
              <OrganizationDashboardPage />
            </ProtectedRoute>
          } />

          {/* Event routes */}
          <Route path="/events/:slug" element={<EventDetailPage />} />
          <Route path="/events/:slug/items/:itemId" element={<EventItemPage />} />
          <Route path="/events/:slug/submit" element={<SubmitItemPage />} />
          <Route path="/events/:slug/submit/success" element={<SubmitItemSuccessPage />} />
          <Route path="/my-events" element={
            <ProtectedRoute>
              <MyEventsPage />
            </ProtectedRoute>
          } />
          <Route path="/events/create" element={
            <ProtectedRoute>
              <CreateEventPage />
            </ProtectedRoute>
          } />
          <Route path="/events/:slug/manage" element={
            <ProtectedRoute>
              <EventDashboardPage />
            </ProtectedRoute>
          } />
          <Route path="/my-wins" element={
            <ProtectedRoute>
              <MyWinsPage />
            </ProtectedRoute>
          } />
          <Route path="/my-bids" element={
            <ProtectedRoute>
              <MyBidsPage />
            </ProtectedRoute>
          } />
          <Route path="/my-items" element={
            <ProtectedRoute>
              <MyItemsPage />
            </ProtectedRoute>
          } />
          <Route path="/my-organizations" element={
            <ProtectedRoute>
              <MyOrganizationsPage />
            </ProtectedRoute>
          } />
          <Route path="/tax-information" element={
            <ProtectedRoute>
              <TaxInformationPage />
            </ProtectedRoute>
          } />
          <Route path="/feedback" element={<FeedbackPage />} />
          <Route path="/admin/feedback" element={
            <ProtectedRoute>
              <AdminFeedbackPage />
            </ProtectedRoute>
          } />
          <Route path="/admin/manage-admins" element={
            <ProtectedRoute>
              <ManageAdminsPage />
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
