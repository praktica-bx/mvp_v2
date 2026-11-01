import React, { useState, useEffect } from 'react'
import { ThemeSwitcherFull } from './ThemeSwitcher'
import ColorSwatch from './ColorSwatch'
import './Settings.css'
import { exportLocalBackup, fetchFromCloud, getPendingChanges, syncToCloud } from '../database'

export default function Settings({ onClose, householdId, onCloudPull }) {
  const [activeTab, setActiveTab] = useState('display')
  const [language, setLanguage] = useState(localStorage.getItem('app-language') || 'EN')
  const [notifications, setNotifications] = useState(
    localStorage.getItem('notifications-enabled') !== 'false'
  )
  
  const [showColorSwatches, setShowColorSwatches] = useState(false)
  const [syncStatus, setSyncStatus] = useState(null)
  const [isSyncing, setIsSyncing] = useState(false)
  const [backupLink, setBackupLink] = useState(null)

  useEffect(() => () => {
    if (backupLink?.url) URL.revokeObjectURL(backupLink.url)
  }, [backupLink])

  

  const handleLanguageChange = (lang) => {
    setLanguage(lang)
    localStorage.setItem('app-language', lang)
  }

  const handleNotificationToggle = () => {
    const newValue = !notifications
    setNotifications(newValue)
    localStorage.setItem('notifications-enabled', newValue.toString())
  }

  const prepareBackup = async () => {
    try {
      const backup = await exportLocalBackup()
      const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }))
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      setBackupLink({ url, filename: `emergency-supply-backup-${timestamp}.json` })
    } catch (error) {
      setSyncStatus(`Backup failed: ${error.message}`)
    }
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
                <button className="btn btn-secondary" onClick={prepareBackup}>Prepare Local Backup (JSON)</button>
                {backupLink && (
                  <a className="btn btn-primary" href={backupLink.url} download={backupLink.filename}>
                    Download Backup
                  </a>
                )}
                <small>Includes locally stored inventory and pending sync changes. Keep this file somewhere safe.</small>
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
                    disabled={isSyncing}
                    onClick={async () => {
                      setIsSyncing(true)
                      setSyncStatus('Syncing…')
                      try {
                        const pull = await fetchFromCloud(householdId, { fullSync: true })
                        if (!pull.success) {
                          setSyncStatus(`Cloud download failed: ${pull.reason || 'Unknown error'}`)
                          return
                        }
                        if (pull.applied > 0) onCloudPull?.()
                        const res = await syncToCloud()
                        const pending = await getPendingChanges()
                        if (!res.success) {
                          setSyncStatus(`Downloaded ${pull.applied || 0}. Upload failed: ${res.reason || res.message || `${res.failed || pending.length} change(s) failed`}`)
                        } else {
                          setSyncStatus(`Downloaded ${pull.applied || 0}; uploaded ${res.synced || 0}; ${pending.length} pending.`)
                        }
                      } catch (err) {
                        setSyncStatus(`Sync failed: ${err.message}`)
                        console.error('Manual sync failed:', err)
                      } finally {
                        setIsSyncing(false)
                      }
                    }}
                  >
                    {isSyncing ? 'Syncing…' : '🔁 Sync now'}
                  </button>
                </div>
                {syncStatus && <small role="status" style={{ opacity: 0.9 }}>{syncStatus}</small>}
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
