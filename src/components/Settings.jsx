import React, { useState, useEffect } from 'react'
import { ThemeSwitcherFull } from './ThemeSwitcher'
import ColorSwatch from './ColorSwatch'
import './Settings.css'
import { syncToCloud, getSetting } from '../database'

export default function Settings({ onClose }) {
  const [activeTab, setActiveTab] = useState('display')
  const [language, setLanguage] = useState(localStorage.getItem('app-language') || 'EN')
  const [notifications, setNotifications] = useState(
    localStorage.getItem('notifications-enabled') !== 'false'
  )
  
  const [showColorSwatches, setShowColorSwatches] = useState(false)
  const [syncStatus, setSyncStatus] = useState(null)
  const [lastSync, setLastSync] = useState(null)

  

  const handleLanguageChange = (lang) => {
    setLanguage(lang)
    localStorage.setItem('app-language', lang)
  }

  const handleNotificationToggle = () => {
    const newValue = !notifications
    setNotifications(newValue)
    localStorage.setItem('notifications-enabled', newValue.toString())
  }

  

  return (
    <div className="settings-modal-overlay" onClick={onClose}>
      <div className="settings-modal u-container" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>⚙️ Settings</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="settings-tabs">
          {/* Household tab removed (obsolete) */}
          <button
            className={`tab-btn ${activeTab === 'display' ? 'active' : ''}`}
            onClick={() => setActiveTab('display')}
          >
            🎨 Display
          </button>
          {/* Storage moved to Household Management (Manage Storage Locations) */}
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
          {/* Household tab removed - managed via Manage Households */}

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

          {/* Storage locations moved to Household Management (Manage Storage Locations) */}

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

              <div className="setting-group">
                <label>Cloud Sync</label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button
                    className="btn btn-primary"
                    onClick={async () => {
                      setSyncStatus('running')
                      try {
                        const res = await syncToCloud()
                        setSyncStatus(res.success ? 'ok' : 'failed')
                        setLastSync(new Date().toISOString())
                      } catch (err) {
                        setSyncStatus('failed')
                        console.error('Manual sync failed:', err)
                      }
                    }}
                  >
                    🔁 Sync now
                  </button>
                  <small style={{ opacity: 0.9 }}>{syncStatus === 'running' ? 'Syncing…' : syncStatus === 'ok' ? 'Last synced just now' : syncStatus === 'failed' ? 'Last sync failed' : ''}</small>
                </div>
                <small>Sync pending local changes to the cloud and fetch recent updates on startup.</small>
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
