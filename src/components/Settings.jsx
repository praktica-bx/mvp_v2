import React, { useState } from 'react'
import { ThemeSwitcherFull } from './ThemeSwitcher'
import ColorSwatch from './ColorSwatch'
import './Settings.css'

export default function Settings({ onClose }) {
  const [activeTab, setActiveTab] = useState('household')
  const [householdMembers, setHouseholdMembers] = useState(
    parseInt(localStorage.getItem('household-members') || '1')
  )
  const [contingencyPersons, setContingencyPersons] = useState(
    parseInt(localStorage.getItem('contingency-persons') || '0')
  )
  const [language, setLanguage] = useState(localStorage.getItem('app-language') || 'EN')
  const [notifications, setNotifications] = useState(
    localStorage.getItem('notifications-enabled') !== 'false'
  )
  const [storageLocations, setStorageLocations] = useState(() => {
    const saved = localStorage.getItem('storage-locations')
    if (saved) {
      return JSON.parse(saved)
    }
    return [
      { id: 1, name: 'Kitchen Pantry', itemCount: 0 },
      { id: 2, name: 'Basement Storage', itemCount: 0 },
      { id: 3, name: 'Garage', itemCount: 0 },
    ]
  })
  const [newLocation, setNewLocation] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editingName, setEditingName] = useState('')
  const [showColorSwatches, setShowColorSwatches] = useState(false)

  const handleSaveHousehold = () => {
    localStorage.setItem('household-members', householdMembers.toString())
    localStorage.setItem('contingency-persons', contingencyPersons.toString())
    alert('Household settings saved!')
  }

  const handleLanguageChange = (lang) => {
    setLanguage(lang)
    localStorage.setItem('app-language', lang)
  }

  const handleNotificationToggle = () => {
    const newValue = !notifications
    setNotifications(newValue)
    localStorage.setItem('notifications-enabled', newValue.toString())
  }

  // Storage locations functions
  const saveLocations = (updated) => {
    setStorageLocations(updated)
    localStorage.setItem('storage-locations', JSON.stringify(updated))
  }

  const addLocation = () => {
    if (!newLocation.trim()) return
    const location = {
      id: Date.now(),
      name: newLocation,
      itemCount: 0,
    }
    saveLocations([...storageLocations, location])
    setNewLocation('')
  }

  const deleteLocation = (id) => {
    if (window.confirm('Delete this storage location?')) {
      saveLocations(storageLocations.filter((loc) => loc.id !== id))
    }
  }

  const startEdit = (location) => {
    setEditingId(location.id)
    setEditingName(location.name)
  }

  const saveEdit = (id) => {
    if (!editingName.trim()) return
    saveLocations(
      storageLocations.map((loc) =>
        loc.id === id ? { ...loc, name: editingName } : loc
      )
    )
    setEditingId(null)
    setEditingName('')
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditingName('')
  }

  return (
    <div className="settings-modal-overlay" onClick={onClose}>
      <div className="settings-modal u-container" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>⚙️ Settings</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="settings-tabs">
          <button
            className={`tab-btn ${activeTab === 'household' ? 'active' : ''}`}
            onClick={() => setActiveTab('household')}
          >
            👥 Household
          </button>
          <button
            className={`tab-btn ${activeTab === 'display' ? 'active' : ''}`}
            onClick={() => setActiveTab('display')}
          >
            🎨 Display
          </button>
          <button
            className={`tab-btn ${activeTab === 'storage' ? 'active' : ''}`}
            onClick={() => setActiveTab('storage')}
          >
            📍 Storage
          </button>
          <button
            className={`tab-btn ${activeTab === 'data' ? 'active' : ''}`}
            onClick={() => setActiveTab('data')}
          >
            💾 Data
          </button>
          <button
            className={`tab-btn ${activeTab === 'account' ? 'active' : ''}`}
            onClick={() => setActiveTab('account')}
          >
            👤 Account
          </button>
        </div>

        <div className="settings-content">
          {/* Household Tab */}
          {activeTab === 'household' && (
            <div className="settings-section">
              <h3>Household Settings</h3>
              <p>Household-specific preparedness settings (number of persons, contingency) are managed in <strong>Manage Households</strong> — open the menu and choose "Manage household" for the active household.</p>
            </div>
          )}

          {/* Display Tab */}
          {activeTab === 'display' && (
            <div className="settings-section">
              <h3>Display Settings</h3>

              <div className="setting-group">
                <label>Color Scheme</label>
                <ThemeSwitcherFull />
                <div style={{ marginTop: '8px' }}>
                  <button className="btn btn-secondary" onClick={() => setShowColorSwatches(true)}>View Color Swatches</button>
                </div>
              </div>

              <div className="setting-group">
                <label htmlFor="language">Language</label>
                <select
                  id="language"
                  value={language}
                  onChange={(e) => handleLanguageChange(e.target.value)}
                  className="language-select"
                >
                  <option value="EN">English</option>
                  <option value="NO">Norwegian</option>
                  <option value="DE">Deutsch</option>
                </select>
              </div>

              <div className="setting-group">
                <label>
                  <input
                    type="checkbox"
                    checked={notifications}
                    onChange={handleNotificationToggle}
                  />
                  Enable Expiry Notifications
                </label>
                <small>Get alerts when items are about to expire</small>
              </div>
            </div>
          )}

          {/* Storage Tab */}
          {activeTab === 'storage' && (
            <div className="settings-section">
              <h3>Storage Locations</h3>

              <div className="add-location-form">
                <input
                  type="text"
                  value={newLocation}
                  onChange={(e) => setNewLocation(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && addLocation()}
                  placeholder="e.g., Kitchen Pantry, Basement..."
                  className="location-input"
                />
                <button className="btn btn-primary btn-small" onClick={addLocation}>
                  Add
                </button>
              </div>

              <div className="location-items">
                {storageLocations.length === 0 ? (
                  <p className="empty-message">No storage locations yet. Add one above!</p>
                ) : (
                  storageLocations.map((location) => (
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
                              className="action-btn"
                              onClick={() => startEdit(location)}
                              title="Edit"
                            >
                              ✏️
                            </button>
                            <button
                              className="action-btn"
                              onClick={() => deleteLocation(location.id)}
                              title="Delete"
                            >
                              🗑️
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {showColorSwatches && (
            <ColorSwatch onClose={() => setShowColorSwatches(false)} />
          )}

          {/* Data Tab */}
          {activeTab === 'data' && (
            <div className="settings-section">
              <h3>Data Management</h3>

              <div className="setting-group">
                <button className="btn btn-secondary">📥 Export Inventory (CSV)</button>
                <small>Download your inventory as a spreadsheet</small>
              </div>

              <div className="setting-group">
                <button className="btn btn-secondary">📤 Import Backup</button>
                <small>Restore inventory from a backup file</small>
              </div>

              <div className="setting-group">
                <button className="btn btn-danger">🗑️ Clear All Data</button>
                <small>Delete all inventory (cannot be undone)</small>
              </div>
            </div>
          )}

          {/* Account Tab */}
          {activeTab === 'account' && (
            <div className="settings-section">
              <h3>Account Settings</h3>

              <div className="setting-info">
                <p>
                  <strong>Email:</strong> {localStorage.getItem('user-email') || 'Not logged in'}
                </p>
              </div>

              <div className="setting-group">
                <label>Security</label>
                <button className="btn btn-secondary">🔐 Change Password</button>
                <small>Update your password</small>
              </div>

              <div className="setting-group">
                <button className="btn btn-danger">🚪 Sign Out</button>
                <small>End your current session</small>
              </div>

              <div className="setting-group">
                <button className="btn btn-danger" style={{ opacity: 0.6 }}>
                  ⚠️ Delete Account (Coming Soon)
                </button>
                <small>Permanently delete your account and all data</small>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
