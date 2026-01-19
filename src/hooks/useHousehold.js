import { useState, useEffect } from 'react'
import { createHousehold, getUserHouseholds, joinHouseholdByCode, leaveHousehold, deleteHousehold, renameHousehold, isFirstTimeUser } from '../nhost'

/**
 * Custom hook to manage household selection and operations
 * Handles: listing user's households, creating new ones, switching between them
 */
export function useHousehold() {
  const [households, setHouseholds] = useState([])
  const [currentHousehold, setCurrentHousehold] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  // Load households on mount or when user changes
  useEffect(() => {
    const loadHouseholds = async () => {
      try {
        setIsLoading(true)
        
        // Get user's households from Nhost
        const userHouseholds = await getUserHouseholds()
        setHouseholds(userHouseholds || [])

        // Check if there's a saved current household in localStorage
        const savedHouseholdId = localStorage.getItem('currentHouseholdId')
        
        if (savedHouseholdId && userHouseholds?.some(h => h.id === savedHouseholdId)) {
          // Restore saved household
          const household = userHouseholds.find(h => h.id === savedHouseholdId)
          setCurrentHousehold(household)
        } else if (userHouseholds && userHouseholds.length > 0) {
          // Set first household as current
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
  }, [])

  const createNewHousehold = async (householdName) => {
    try {
      setIsLoading(true)
      const newHousehold = await createHousehold(householdName)
      
      if (newHousehold) {
        setHouseholds(prev => [...prev, newHousehold])
        setCurrentHousehold(newHousehold)
        localStorage.setItem('currentHouseholdId', newHousehold.id)
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
    hasHousehold: currentHousehold !== null,
    isFirstTime: !currentHousehold && households.length === 0,
  }
}

export default useHousehold
