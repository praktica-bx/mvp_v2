import React, { useState, useEffect } from 'react'
import './StorageLocations.css'
import {
  fetchStorageLocations,
  insertStorageLocation,
  updateStorageLocation,
  deleteStorageLocation,
  isNhostConfigured,
  isNhostAuthenticated,
  ensureNhostReady,
} from '../nhost'

export default function StorageLocations({ onClose, householdId }) {
  const [locations, setLocations] = useState([])
  const [newLocation, setNewLocation] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editingName, setEditingName] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [cloudEnabled, setCloudEnabled] = useState(false)

  // Wait for Nhost to initialize before checking auth status
  useEffect(() => {
    let cancelled = false
    async function load() {
      await ensureNhostReady()
      const enabled = isNhostConfigured() && isNhostAuthenticated()
      if (cancelled) return
      setCloudEnabled(enabled)
      if (!enabled || !householdId) {
        setLoading(false)
        return
      }
      try {
        const locs = await fetchStorageLocations(householdId)
        if (!cancelled) setLocations(locs)
      } catch (e) {
        if (!cancelled) setError(e.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [householdId])

  const addLocation = async () => {
    if (!newLocation.trim() || !householdId) return
    try {
      const created = await insertStorageLocation(householdId, newLocation.trim())
      if (created) setLocations((prev) => [...prev, created])
      setNewLocation('')
    } catch (e) {
      setError(e.message)
    }
  }

  const deleteLocation = async (id) => {
    if (!window.confirm('Delete this storage location?')) return
    try {
      await deleteStorageLocation(id)
      setLocations((prev) => prev.filter((loc) => loc.id !== id))
    } catch (e) {
      setError(e.message)
    }
  }

  const startEdit = (location) => {
    setEditingId(location.id)
    setEditingName(location.name)
  }

  const saveEdit = async (id) => {
    if (!editingName.trim()) return
    try {
      const updated = await updateStorageLocation(id, editingName.trim())
      if (updated) {
        setLocations((prev) => prev.map((loc) => (loc.id === id ? updated : loc)))
      }
      setEditingId(null)
      setEditingName('')
    } catch (e) {
      setError(e.message)
    }
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditingName('')
  }

  return (
    <div className="storage-overlay" onClick={onClose}>
      <div className="storage-modal u-container" onClick={(e) => e.stopPropagation()}>
        <div className="storage-header">
          <h2>📍 Storage Locations</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="storage-content">
          {!cloudEnabled && (
            <p className="empty-message" style={{ color: 'var(--color-warning)' }}>
              ⚠️ Not connected to cloud. Storage locations require an active login.
            </p>
          )}
          {error && (
            <p className="empty-message" style={{ color: 'var(--color-error)' }}>
              Error: {error}
            </p>
          )}

          <div className="add-location-section">
            <h3>Add New Location</h3>
            <div className="add-location-form">
              <input
                type="text"
                value={newLocation}
                onChange={(e) => setNewLocation(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && addLocation()}
                placeholder="e.g., Kitchen Pantry, Basement, Garage..."
                className="location-input"
                disabled={!cloudEnabled}
              />
              <button className="btn btn-primary" onClick={addLocation} disabled={!cloudEnabled}>
                Add
              </button>
            </div>
          </div>

          <div className="locations-list">
            <h3>Your Storage Locations</h3>
            {loading ? (
              <p className="empty-message">Loading...</p>
            ) : locations.length === 0 ? (
              <p className="empty-message">No storage locations yet. Add one above!</p>
            ) : (
              <div className="location-items">
                {locations.map((location) => (
                  <div key={location.id} className="location-item">
                    {editingId === location.id ? (
                      <div className="edit-location">
                        <input
                          type="text"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          className="location-input"
                          autoFocus
                        />
                        <button
                          className="btn btn-small btn-primary"
                          onClick={() => saveEdit(location.id)}
                        >
                          Save
                        </button>
                        <button
                          className="btn btn-small btn-secondary"
                          onClick={cancelEdit}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="location-info">
                          <span className="location-name">{location.name}</span>
                        </div>
                        <div className="location-actions">
                          <button
                            className="action-btn edit-btn"
                            onClick={() => startEdit(location)}
                            title="Edit"
                          >
                            ✏️
                          </button>
                          <button
                            className="action-btn delete-btn"
                            onClick={() => deleteLocation(location.id)}
                            title="Delete"
                          >
                            🗑️
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="location-tips">
            <h3>💡 Tips</h3>
            <ul>
              <li>Create locations for different areas of your home</li>
              <li>Select a location when adding items to track them</li>
              <li>Use categories like "Pantry", "Basement", "Garage", "Office"</li>
              <li>Storage locations are synced across all your devices</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
