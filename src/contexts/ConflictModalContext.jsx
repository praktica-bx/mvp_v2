import React, { createContext, useContext, useState, useCallback } from 'react'
import ConflictResolutionModal from '../components/ConflictResolutionModal'

const ConflictModalContext = createContext(null)

export const ConflictModalProvider = ({ children }) => {
  const [modalState, setModalState] = useState({ isOpen: false, local: null, remote: null })
  const [resolver, setResolver] = useState(null)

  const open = useCallback(({ local, remote }) => {
    return new Promise((resolve) => {
      setModalState({ isOpen: true, local, remote })
      setResolver(() => resolve)
    })
  }, [])

  const close = useCallback(() => {
    setModalState({ isOpen: false, local: null, remote: null })
    if (resolver) {
      resolver({ action: 'cancel' })
      setResolver(null)
    }
  }, [resolver])

  const keepLocal = useCallback(() => {
    if (resolver) resolver({ action: 'keepLocal' })
    setResolver(null)
    setModalState({ isOpen: false, local: null, remote: null })
  }, [resolver])

  const useRemote = useCallback(() => {
    if (resolver) resolver({ action: 'useRemote' })
    setResolver(null)
    setModalState({ isOpen: false, local: null, remote: null })
  }, [resolver])

  return (
    <ConflictModalContext.Provider value={{ open }}>
      {children}
      <ConflictResolutionModal
        isOpen={modalState.isOpen}
        local={modalState.local}
        remote={modalState.remote}
        onKeepLocal={keepLocal}
        onUseRemote={useRemote}
        onCancel={close}
      />
    </ConflictModalContext.Provider>
  )
}

export const useConflictModal = () => {
  const ctx = useContext(ConflictModalContext)
  if (!ctx) throw new Error('useConflictModal must be used within ConflictModalProvider')
  return ctx
}

export default ConflictModalContext
