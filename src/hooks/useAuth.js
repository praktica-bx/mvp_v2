import { useState, useEffect } from 'react'
import { getNhostUser, isNhostAuthenticated, signOutFromNhost, isNhostConfigured } from '../nhost'

/**
 * Custom hook to manage authentication state
 * Returns auth status, user info, and logout function
 */
export function useAuth() {
  const [user, setUser] = useState(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  // Check auth status on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        // If Nhost is not configured, skip auth check
        if (!isNhostConfigured()) {
          console.log('[AUTH] Nhost not configured, running in local-only mode')
          setIsLoading(false)
          return
        }

        // Check if user is authenticated
        if (isNhostAuthenticated()) {
          const currentUser = getNhostUser()
          if (currentUser) {
            setUser(currentUser)
            setIsAuthenticated(true)
          }
        }
      } catch (err) {
        console.error('[AUTH] Error checking authentication:', err)
        setError(err.message)
      } finally {
        setIsLoading(false)
      }
    }

    checkAuth()
  }, [])

  const logout = async () => {
    try {
      setIsLoading(true)
      await signOutFromNhost()
      setUser(null)
      setIsAuthenticated(false)
      setError(null)
      return { success: true }
    } catch (err) {
      console.error('[AUTH] Error signing out:', err)
      setError(err.message)
      return { success: false, error: err.message }
    } finally {
      setIsLoading(false)
    }
  }

  const handleAuthSuccess = (session) => {
    if (session && session.user) {
      setUser(session.user)
      setIsAuthenticated(true)
      setError(null)
    }
  }

  return {
    user,
    isAuthenticated,
    isLoading,
    error,
    logout,
    handleAuthSuccess,
    nhostConfigured: isNhostConfigured(),
  }
}

export default useAuth
