import React, { useState, useEffect } from 'react'
import './StorageLocations.css'

export default function StorageLocations({ onClose }) {
  const [locations, setLocations] = useState([])
  const [newLocation, setNewLocation] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editingName, setEditingName] = useState('')

  // Load locations from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('storage-locations')
    if (saved) {
      setLocations(JSON.parse(saved))
    } else {
      // Default locations
      setLocations([
        { id: 1, name: 'Kitchen Pantry', itemCount: 0 },
        { id: 2, name: 'Basement Storage', itemCount: 0 },
        { id: 3, name: 'Garage', itemCount: 0 },
      ])
    }
  }, [])

  const saveLocations = (updatedLocations) => {
    setLocations(updatedLocations)
    localStorage.setItem('storage-locations', JSON.stringify(updatedLocations))
  }

  const addLocation = () => {
    if (!newLocation.trim()) return

    const location = {
      id: Date.now(),
      name: newLocation,
      itemCount: 0,
    }

    const updated = [...locations, location]
    saveLocations(updated)
    setNewLocation('')
  }

  const deleteLocation = (id) => {
    if (window.confirm('Delete this storage location?')) {
      const updated = locations.filter((loc) => loc.id !== id)
      saveLocations(updated)
    }
  }

  const startEdit = (location) => {
    setEditingId(location.id)
    setEditingName(location.name)
  }

  const saveEdit = (id) => {
    if (!editingName.trim()) return

    const updated = locations.map((loc) =>
      loc.id === id ? { ...loc, name: editingName } : loc
    )
    saveLocations(updated)
    setEditingId(null)
    setEditingName('')
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
              />
              <button className="btn btn-primary" onClick={addLocation}>
                Add
              </button>
            </div>
          </div>

          <div className="locations-list">
            <h3>Your Storage Locations</h3>
            {locations.length === 0 ? (
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
                          <span className="location-count">{location.itemCount || 0} items</span>
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
              <li>Item counts update automatically as you add inventory</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
