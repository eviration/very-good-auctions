import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMsal } from '@azure/msal-react'

export function AuthCallback() {
  const { instance } = useMsal()
  const navigate = useNavigate()

  useEffect(() => {
    instance.handleRedirectPromise()
      .then((response) => {
        if (response) {
          // Successfully logged in
          const returnUrl = sessionStorage.getItem('returnUrl') || '/'
          sessionStorage.removeItem('returnUrl')
          navigate(returnUrl, { replace: true })
        } else {
          // No response, redirect to home
          navigate('/', { replace: true })
        }
      })
      .catch((error) => {
        console.error('Auth callback error:', error)
        navigate('/', { replace: true })
      })
  }, [instance, navigate])

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-sage border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-lg text-white">Completing sign in...</p>
      </div>
    </div>
  )
}
