import './OfflineWarning.css'

export default function OfflineWarning({ isOnline, showOnAddItem = false }) {
  if (isOnline && !showOnAddItem) {
    return null
  }

  if (showOnAddItem && isOnline) {
    return (
      <div className="offline-warning offline-saving">
        <span className="warning-icon">💾</span>
        <span className="warning-text">Saving offline. Will sync when online.</span>
      </div>
    )
  }

  return (
    <div className="offline-warning">
      <span className="warning-icon">📵</span>
      <span className="warning-text">You are offline. Items will be saved locally and synced when online.</span>
    </div>
  )
}
