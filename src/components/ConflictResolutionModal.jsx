import React, { useRef, useEffect } from 'react'
import './ConflictResolutionModal.css'

export default function ConflictResolutionModal({ isOpen, local, remote, onKeepLocal, onUseRemote, onCancel }) {
  const modalRef = useRef(null)
  const primaryRef = useRef(null)

  useEffect(() => {
    if (!isOpen) return
    // focus first action button
    primaryRef.current?.focus()

    const onKey = (e) => {
      if (e.key === 'Escape') onCancel()
      if (e.key === 'Tab') {
        const focusable = modalRef.current.querySelectorAll('a[href], area, input, select, textarea, button, [tabindex]:not([tabindex="-1"])')
        if (!focusable.length) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isOpen, onCancel])

  if (!isOpen) return null

  return (
    <div className="conflict-modal-overlay" onClick={onCancel}>
      <div className="conflict-modal" onClick={(e) => e.stopPropagation()} ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="conflict-title">
        <div className="conflict-header">
          <h3 id="conflict-title">Conflict detected</h3>
          <button className="close" onClick={onCancel} aria-label="Close">✕</button>
        </div>

        <p>A newer version exists on the server. Choose how to resolve this conflict.</p>

        <div className="conflict-compare">
          <div className="conflict-block">
            <h4>Your Changes</h4>
            <pre>{JSON.stringify(local, null, 2)}</pre>
          </div>
          <div className="conflict-block">
            <h4>Remote Version</h4>
            <pre>{JSON.stringify(remote, null, 2)}</pre>
          </div>
        </div>

        <div className="conflict-actions">
          <button ref={primaryRef} className="btn btn-primary" onClick={onKeepLocal}>Keep my changes (overwrite)</button>
          <button className="btn btn-secondary" onClick={onUseRemote}>Use remote version</button>
          <button className="btn" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
