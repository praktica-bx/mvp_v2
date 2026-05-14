import { useState } from 'react'
const COMMON_ALLERGENS = [
  'milk', 'eggs', 'fish', 'shellfish', 'tree nuts', 'peanuts', 'wheat', 'soy', 'sesame', 'mustard', 'celery', 'sulphites', 'lupin', 'molluscs'
]
import './HouseholdManagement.css'
import StorageLocations from './StorageLocations'
import { getHouseholdInviteCode } from '../nhost'

export default function HouseholdManagement({
  currentHousehold,
  households,
  onSelectHousehold,
  onCreateHousehold,
  onRenameHousehold,
  onDeleteHousehold,
  onClose,
  onSettingsSaved,
  isLoading
}) {
  const [householdMembers, setHouseholdMembers] = useState(() => {
    try {
      const key = currentHousehold ? `household:${currentHousehold.id}:members` : null
      return parseInt((key && localStorage.getItem(key)) || localStorage.getItem('household-members') || '1')
    } catch (e) { return 1 }
  })
  const [contingencyPersons, setContingencyPersons] = useState(() => {
    try {
      const key = currentHousehold ? `household:${currentHousehold.id}:contingency` : null
      return parseInt((key && localStorage.getItem(key)) || localStorage.getItem('contingency-persons') || '0')
    } catch (e) { return 0 }
  })
  const [activeTab, setActiveTab] = useState('current') // 'current', 'rename', 'create', 'switch'
  const [newName, setNewName] = useState(currentHousehold?.name || '')
  const [newHouseholdName, setNewHouseholdName] = useState('')
  const [error, setError] = useState('')
  const [actionInProgress, setActionInProgress] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [inviteLoading, setInviteLoading] = useState(false)
  const [showStorageLocations, setShowStorageLocations] = useState(false)
  const tabsClass = `management-tabs ${households.length > 1 ? 'many' : ''} ${currentHousehold?.name && currentHousehold.name.length > 20 ? 'long-name' : ''}`

  const handleRenameHousehold = async (e) => {
    e.preventDefault()
    setError('')

    if (!newName.trim()) {
      setError('Household name is required')
      return
    }

    if (newName === currentHousehold?.name) {
      setError('Please enter a different name')
      return
    }

    try {
      setActionInProgress(true)
      const result = await onRenameHousehold(currentHousehold.id, newName)
      
      if (result.success) {
        setActiveTab('current')
        setError('')
      } else {
        setError(result.error || 'Failed to rename household')
      }
    } catch (err) {
      setError(err.message || 'An error occurred')
    } finally {
      setActionInProgress(false)
    }
  }

  const handleCreateHousehold = async (e) => {
    e.preventDefault()
    setError('')

    if (!newHouseholdName.trim()) {
      setError('Household name is required')
      return
    }

    try {
      setActionInProgress(true)
      const result = await onCreateHousehold(newHouseholdName)
      
      if (result.success) {
        setNewHouseholdName('')
        setActiveTab('switch')
      } else {
        setError(result.error || 'Failed to create household')
      }
    } catch (err) {
      setError(err.message || 'An error occurred')
    } finally {
      setActionInProgress(false)
    }
  }

  const handleDeleteHousehold = async () => {
    try {
      setActionInProgress(true)
      const result = await onDeleteHousehold(currentHousehold.id)
      
      if (result.success) {
        setConfirmDelete(false)
        onClose()
      } else {
        setError(result.error || 'Failed to delete household')
      }
    } catch (err) {
      setError(err.message || 'An error occurred')
    } finally {
      setActionInProgress(false)
    }
  }

  const handleSelectHousehold = (householdId) => {
    onSelectHousehold(householdId)
    onClose()
  }

  return (
    <div className="household-management-overlay" onClick={onClose}>
      <div className="household-management-modal" onClick={(e) => e.stopPropagation()}>
        <div className="management-header">
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <h2>Manage Households</h2>
            {currentHousehold?.name && (
              <div className="active-household-label">Active: {currentHousehold.name}</div>
            )}
          </div>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div className={tabsClass}>
          <button
            className={`tab-btn ${activeTab === 'current' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('current')
              setError('')
            }}
          >
            {currentHousehold?.name}
          </button>
          <button
            className={`tab-btn ${activeTab === 'rename' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('rename')
              setNewName(currentHousehold?.name || '')
              setError('')
            }}
          >
            Rename
          </button>
          <button
            className={`tab-btn ${activeTab === 'create' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('create')
              setNewHouseholdName('')
              setError('')
            }}
          >
            Create New
          </button>
          {households.length > 1 && (
            <button
              className={`tab-btn ${activeTab === 'switch' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('switch')
                setError('')
              }}
            >
              Switch ({households.length})
            </button>
          )}
        </div>

        <div className="management-content">
          {error && <div className="alert alert-error">{error}</div>}

          {activeTab === 'current' && (
            <div className="tab-content">
              <h3>{currentHousehold?.name}</h3>
              <div className="household-info">
                <div className="setting-group">
                  <label>Number of Persons</label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={householdMembers}
                    onChange={(e) => setHouseholdMembers(parseInt(e.target.value) || 1)}
                  />
                </div>
                <div className="setting-group contingency-group">
                  <label>Contingency Persons</label>
                  <input
                    type="number"
                    min="0"
                    max="20"
                    value={contingencyPersons}
                    onChange={(e) => setContingencyPersons(parseInt(e.target.value) || 0)}
                  />
                </div>

                <div className="setting-group members-group">
                  <label>Members</label>
                  {currentHousehold?.household_members?.length ? (
                    <div className="members-list">
                      {currentHousehold.household_members.map((m, idx) => (
                        <div key={m.id || idx} className="member-item">
                          <span className="member-name">{m.email || m.user_id || m.id || `Member ${idx + 1}`}{m.role === 'admin' ? ' (owner)' : ''}</span>
                          <button
                            className="btn btn-secondary btn-small"
                            onClick={() => {
                              if (typeof onRemoveMember === 'function') {
                                onRemoveMember(currentHousehold.id, m.id || m.user_id)
                              } else {
                                alert('Removing members is not available in this mode.')
                              }
                            }}
                            style={{ marginLeft: 8 }}
                          >
                            Remove
                          </button>
                          <div className="member-allergies" style={{ marginTop: 8 }}>
                            <label style={{ fontWeight: 500 }}>Allergies:</label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '4px 0' }}>
                              {COMMON_ALLERGENS.map((allergen) => {
                                const memberAllergies = (m.allergies || '').split(',').map(a => a.trim()).filter(Boolean)
                                const checked = memberAllergies.includes(allergen)
                                return (
                                  <label key={allergen} style={{ fontWeight: 400 }}>
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={e => {
                                        const updated = e.target.checked
                                          ? [...memberAllergies, allergen]
                                          : memberAllergies.filter(a => a !== allergen)
                                        if (typeof m.onUpdateAllergies === 'function') {
                                          m.onUpdateAllergies(updated.join(','))
                                        }
                                      }}
                                    /> {allergen}
                                  </label>
                                )
                              })}
                            </div>
                            <input
                              type="text"
                              placeholder="Other allergies (comma separated)"
                              defaultValue={(m.allergies || '').split(',').filter(a => !COMMON_ALLERGENS.includes(a.trim())).join(', ')}
                              onBlur={e => {
                                const custom = e.target.value.split(',').map(a => a.trim()).filter(Boolean)
                                const memberAllergies = (m.allergies || '').split(',').map(a => a.trim()).filter(Boolean)
                                const nonCommon = memberAllergies.filter(a => !COMMON_ALLERGENS.includes(a))
                                const combined = [...new Set([...memberAllergies.filter(a => COMMON_ALLERGENS.includes(a)), ...custom])]
                                if (typeof m.onUpdateAllergies === 'function') {
                                  m.onUpdateAllergies(combined.join(','))
                                }
                              }}
                              style={{ marginTop: 4, width: '100%' }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="empty-message">No members listed for this household.</p>
                  )}
                  <div className="invite-row">
                    // NOTE: You must implement the logic to fetch, update, and persist the allergies field for each member via GraphQL/Hasura mutations.
                    // The UI above expects each member object to have an 'allergies' field and an 'onUpdateAllergies' callback for saving changes.
                    <button
                      className="btn btn-secondary"
                      onClick={async () => {
                        if (!currentHousehold?.id) return setError('No household selected')
                        setInviteLoading(true)
                        setError('')
                        try {
                          const code = await getHouseholdInviteCode(currentHousehold.id)
                          const subject = `Invite to ${currentHousehold.name} — Emergency Supply`
                          const body = `You've been invited to join the household \"${currentHousehold.name}\" in Emergency Supply.\n\nInvite code: ${code}\n\nOpen the app and enter this code to join.`

                          if (navigator.share) {
                            try {
                              await navigator.share({ title: subject, text: body })
                            } catch (shareErr) {
                              // user cancelled share sheet; ignore
                            }
                          } else {
                            const mailto = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
                            window.location.href = mailto
                          }
                        } catch (err) {
                          setError(err.message || 'Failed to create invite code')
                        } finally {
                          setInviteLoading(false)
                        }
                      }}
                      disabled={inviteLoading}
                      style={{ marginBottom: '10px' }}
                    >
                      Send invite by mail                    </button>
                  </div>
                </div>

                <div className="setting-group">
                  <div>
                    <button className="btn btn-secondary" onClick={() => setShowStorageLocations(true)} style={{ marginBottom: '10px' }}>
                      Manage Storage Locations
                    </button>
                  </div>
                </div>
                <div className="setting-actions">
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      try {
                        localStorage.setItem(`household:${currentHousehold.id}:members`, householdMembers.toString())
                        localStorage.setItem(`household:${currentHousehold.id}:contingency`, contingencyPersons.toString())
                        if (typeof onSettingsSaved === 'function') onSettingsSaved()
                        alert('Household settings saved')
                      } catch (e) {
                        console.error('Error saving household settings', e)
                      }
                    }}
                    style={{ marginBottom: '10px' }}
                  >
                    Save Household Settings
                  </button>
                </div>
              </div>

              <button
                className="btn btn-danger"
                onClick={() => setConfirmDelete(true)}
                disabled={actionInProgress}
                style={{ marginBottom: '10px' }}
              >
                Delete This Household
              </button>

              {confirmDelete && (
                <div className="confirm-dialog">
                  <p>⚠️ Delete "{currentHousehold?.name}"?</p>
                  <p className="warning-text">This action cannot be undone. All data will be lost.</p>
                  <div className="confirm-actions">
                    <button
                      className="btn btn-danger"
                      onClick={handleDeleteHousehold}
                      disabled={actionInProgress}
                    >
                      Yes, Delete
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={() => setConfirmDelete(false)}
                      disabled={actionInProgress}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'rename' && (
            <div className="tab-content">
              <h3>Rename Household</h3>
              <form onSubmit={handleRenameHousehold}>
                <div className="form-group">
                  <label htmlFor="newName">New Name</label>
                  <input
                    id="newName"
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g., Main House"
                    autoFocus
                    disabled={actionInProgress}
                  />
                </div>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={actionInProgress}
                >
                  {actionInProgress ? 'Updating...' : 'Update Name'}
                </button>
              </form>
            </div>
          )}

          {activeTab === 'create' && (
            <div className="tab-content">
              <h3>Create New Household</h3>
              <form onSubmit={handleCreateHousehold}>
                <div className="form-group">
                  <label htmlFor="householdName">Household Name</label>
                  <input
                    id="householdName"
                    type="text"
                    value={newHouseholdName}
                    onChange={(e) => setNewHouseholdName(e.target.value)}
                    placeholder="e.g., Cabin, Office"
                    autoFocus
                    disabled={actionInProgress}
                  />
                </div>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={actionInProgress}
                >
                  {actionInProgress ? 'Creating...' : 'Create Household'}
                </button>
              </form>
            </div>
          )}

          {activeTab === 'switch' && households.length > 1 && (
            <div className="tab-content">
              <h3>Switch Household</h3>
              <div className="households-list">
                {households.map((household) => (
                  <button
                    key={household.id}
                    className={`household-item ${household.id === currentHousehold?.id ? 'current' : ''}`}
                    onClick={() => handleSelectHousehold(household.id)}
                    disabled={actionInProgress}
                  >
                    <div className="household-item-main">
                      <span className="household-name">{household.name}</span>
                      <span className="household-members">
                        {household.household_members?.length || 1} member{(household.household_members?.length || 1) !== 1 ? 's' : ''}
                      </span>
                    </div>
                    {household.id === currentHousehold?.id && <span className="current-badge">✓ Current</span>}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      {showStorageLocations && (
        <StorageLocations onClose={() => setShowStorageLocations(false)} householdId={currentHousehold?.id} />
      )}
    </div>
  )
}
