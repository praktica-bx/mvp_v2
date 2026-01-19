import { useState, useEffect } from 'react'

/**
 * Hook to detect online/offline status
 */
export const useOnlineStatus = () => {
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true)
  const [lastOnlineTime, setLastOnlineTime] = useState(new Date())

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true)
      setLastOnlineTime(new Date())
      console.log('[NETWORK] Online')
    }

    const handleOffline = () => {
      setIsOnline(false)
      console.log('[NETWORK] Offline')
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return { isOnline, lastOnlineTime }
}

export default useOnlineStatus
