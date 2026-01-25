import React from 'react'
import './ConflictResolutionModal.css'

export default function ConflictResolutionModal({ isOpen, local, remote, onKeepLocal, onUseRemote, onCancel }) {
  if (!isOpen) return null

  return (
    <div className="conflict-modal-overlay" onClick={onCancel}>
      <div className="conflict-modal" onClick={(e) => e.stopPropagation()}>
        <div className="conflict-header">
          <h3>Conflict detected</h3>
          <button className="close" onClick={onCancel}>✕</button>
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
          <button className="btn btn-primary" onClick={onKeepLocal}>Keep my changes (overwrite)</button>
          <button className="btn btn-secondary" onClick={onUseRemote}>Use remote version</button>
          <button className="btn" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
