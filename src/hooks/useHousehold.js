import { useState, useEffect } from 'react'
import { createHousehold, getUserHouseholds, joinHouseholdByCode, leaveHousehold, deleteHousehold, renameHousehold, isFirstTimeUser, inviteUserToHousehold, removeHouseholdMember } from '../nhost'

/**
 * Custom hook to manage household selection and operations
 * Handles: listing user's households, creating new ones, switching between them
 */
export function useHousehold({ isAuthenticated = false } = {}) {
  const [households, setHouseholds] = useState([])
  const [currentHousehold, setCurrentHousehold] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isOfflineFallback, setIsOfflineFallback] = useState(false)

  // Load households only after authentication is confirmed
  useEffect(() => {
    if (!isAuthenticated) {
      setIsLoading(false)
      return
    }
    const loadHouseholds = async () => {
      try {
        setIsLoading(true)
        setIsOfflineFallback(false)

        // Get user's households from Nhost
        const userHouseholds = await getUserHouseholds()
        const rawSavedId = localStorage.getItem('currentHouseholdId')
        // Discard legacy locally-generated IDs (not valid UUIDs) — they can't be used with cloud
        const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        if (rawSavedId && !UUID_RE.test(rawSavedId)) {
          localStorage.removeItem('currentHouseholdId')
          localStorage.removeItem('cachedHouseholds')
        }
        // Also purge any non-UUID entries from pendingHouseholds
        try {
          const pendingRaw = localStorage.getItem('pendingHouseholds')
          if (pendingRaw) {
            const pending = JSON.parse(pendingRaw)
            const cleaned = pending.filter(h => UUID_RE.test(h.id))
            if (cleaned.length !== pending.length) {
              localStorage.setItem('pendingHouseholds', JSON.stringify(cleaned))
            }
          }
        } catch { localStorage.removeItem('pendingHouseholds') }
        const savedHouseholdId = UUID_RE.test(rawSavedId) ? rawSavedId : null

        // If cloud returned nothing but we have a locally cached copy, use it
        // This keeps the app usable when Nhost is paused / unreachable
        if ((!userHouseholds || userHouseholds.length === 0) && savedHouseholdId) {
          const cachedRaw = localStorage.getItem('cachedHouseholds')
          const cached = cachedRaw ? JSON.parse(cachedRaw) : null
          if (cached && cached.length > 0) {
            console.warn('[HOUSEHOLD] Cloud returned no households; using local cache (offline fallback)')
            setHouseholds(cached)
            const savedHousehold = cached.find(h => h.id === savedHouseholdId) || cached[0]
            setCurrentHousehold(savedHousehold)
            setIsOfflineFallback(true)
            setError(null)
            return
          }
        }

        setHouseholds(userHouseholds || [])

        // Persist to cache for offline fallback
        if (userHouseholds && userHouseholds.length > 0) {
          localStorage.setItem('cachedHouseholds', JSON.stringify(userHouseholds))
        }

        // Restore or select household
        if (savedHouseholdId && userHouseholds?.some(h => h.id === savedHouseholdId)) {
          setCurrentHousehold(userHouseholds.find(h => h.id === savedHouseholdId))
        } else if (userHouseholds && userHouseholds.length > 0) {
          setCurrentHousehold(userHouseholds[0])
          localStorage.setItem('currentHouseholdId', userHouseholds[0].id)
        }

        setError(null)
      } catch (err) {
        console.error('[HOUSEHOLD] Error loading households:', err)
        setError(err.message)
      } finally {
        setIsLoading(false)
      }
    }

    loadHouseholds()
  }, [isAuthenticated])

  const createNewHousehold = async (householdName) => {
    try {
      setIsLoading(true)
      const newHousehold = await createHousehold(householdName)
      
      if (newHousehold) {
        const updated = [...households, newHousehold]
        setHouseholds(updated)
        setCurrentHousehold(newHousehold)
        localStorage.setItem('currentHouseholdId', newHousehold.id)
        localStorage.setItem('cachedHouseholds', JSON.stringify(updated))
        return { success: true, household: newHousehold }
      }
    } catch (err) {
      console.error('[HOUSEHOLD] Error creating household:', err)
      setError(err.message)
      return { success: false, error: err.message }
    } finally {
      setIsLoading(false)
    }
  }

  const inviteMember = async (householdId, userEmail) => {
    try {
      setIsLoading(true)
      const invite = await inviteUserToHousehold(householdId, userEmail)
      // refresh households from server to get updated invites/members
      const userHouseholds = await getUserHouseholds()
      setHouseholds(userHouseholds || [])
      // keep current household reference if present
      if (currentHousehold && userHouseholds?.some(h => h.id === currentHousehold.id)) {
        const updated = userHouseholds.find(h => h.id === currentHousehold.id)
        setCurrentHousehold(updated)
      }
      return { success: true, invite }
    } catch (err) {
      console.error('[HOUSEHOLD] Error inviting member:', err)
      return { success: false, error: err.message }
    } finally {
      setIsLoading(false)
    }
  }

  const removeMember = async (householdId, memberId) => {
    try {
      setIsLoading(true)
      const result = await removeHouseholdMember(householdId, memberId)
      // refresh households
      const userHouseholds = await getUserHouseholds()
      setHouseholds(userHouseholds || [])
      if (currentHousehold && userHouseholds?.some(h => h.id === currentHousehold.id)) {
        const updated = userHouseholds.find(h => h.id === currentHousehold.id)
        setCurrentHousehold(updated)
      }
      return { success: true }
    } catch (err) {
      console.error('[HOUSEHOLD] Error removing member:', err)
      return { success: false, error: err.message }
    } finally {
      setIsLoading(false)
    }
  }

  const selectHousehold = (householdId) => {
    try {
      const household = households.find(h => h.id === householdId)
      if (household) {
        setCurrentHousehold(household)
        localStorage.setItem('currentHouseholdId', householdId)
        return { success: true }
      } else {
        return { success: false, error: 'Household not found' }
      }
    } catch (err) {
      console.error('[HOUSEHOLD] Error selecting household:', err)
      setError(err.message)
      return { success: false, error: err.message }
    }
  }

  const joinHousehold = async (inviteCode) => {
    try {
      setIsLoading(true)
      const household = await joinHouseholdByCode(inviteCode)
      
      if (household) {
        setHouseholds(prev => [...prev, household])
        setCurrentHousehold(household)
        localStorage.setItem('currentHouseholdId', household.id)
        return { success: true, household }
      }
    } catch (err) {
      console.error('[HOUSEHOLD] Error joining household:', err)
      setError(err.message)
      return { success: false, error: err.message }
    } finally {
      setIsLoading(false)
    }
  }

  const leaveHouseholdFunc = async (householdId) => {
    try {
      setIsLoading(true)
      await leaveHousehold(householdId)
      
      setHouseholds(prev => prev.filter(h => h.id !== householdId))
      
      if (currentHousehold?.id === householdId) {
        const remaining = households.filter(h => h.id !== householdId)
        if (remaining.length > 0) {
          setCurrentHousehold(remaining[0])
          localStorage.setItem('currentHouseholdId', remaining[0].id)
        } else {
          setCurrentHousehold(null)
          localStorage.removeItem('currentHouseholdId')
        }
      }
      
      return { success: true }
    } catch (err) {
      console.error('[HOUSEHOLD] Error leaving household:', err)
      setError(err.message)
      return { success: false, error: err.message }
    } finally {
      setIsLoading(false)
    }
  }

  const deleteHouseholdFunc = async (householdId) => {
    try {
      setIsLoading(true)
      await deleteHousehold(householdId)
      
      setHouseholds(prev => prev.filter(h => h.id !== householdId))
      
      if (currentHousehold?.id === householdId) {
        const remaining = households.filter(h => h.id !== householdId)
        if (remaining.length > 0) {
          setCurrentHousehold(remaining[0])
          localStorage.setItem('currentHouseholdId', remaining[0].id)
        } else {
          setCurrentHousehold(null)
          localStorage.removeItem('currentHouseholdId')
        }
      }
      
      return { success: true }
    } catch (err) {
      console.error('[HOUSEHOLD] Error deleting household:', err)
      setError(err.message)
      return { success: false, error: err.message }
    } finally {
      setIsLoading(false)
    }
  }

  const renameHouseholdFunc = async (householdId, newName) => {
    try {
      setIsLoading(true)
      const updated = await renameHousehold(householdId, newName)
      
      setHouseholds(prev => prev.map(h => h.id === householdId ? { ...h, name: newName } : h))
      
      if (currentHousehold?.id === householdId) {
        setCurrentHousehold({ ...currentHousehold, name: newName })
      }
      
      return { success: true, household: updated }
    } catch (err) {
      console.error('[HOUSEHOLD] Error renaming household:', err)
      setError(err.message)
      return { success: false, error: err.message }
    } finally {
      setIsLoading(false)
    }
  }

  return {
    households,
    currentHousehold,
    isLoading,
    error,
    createNewHousehold,
    selectHousehold,
    joinHousehold,
    leaveHousehold: leaveHouseholdFunc,
    deleteHousehold: deleteHouseholdFunc,
    renameHousehold: renameHouseholdFunc,
    inviteMember,
    removeMember,
    hasHousehold: currentHousehold !== null,
    isFirstTime: !currentHousehold && households.length === 0,
    isOfflineFallback,
  }
}

export default useHousehold
