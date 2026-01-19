import { useState } from 'react'
import './HouseholdSelector.css'

export default function HouseholdSelector({ households, onSelectHousehold, onCreateHousehold, onJoinHousehold, onLeaveHousehold, onDeleteHousehold, isLoading }) {
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [showJoinForm, setShowJoinForm] = useState(false)
  const [newHouseholdName, setNewHouseholdName] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [actionInProgress, setActionInProgress] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)

  const handleCreateHousehold = async (e) => {
    e.preventDefault()
    setError('')

    if (!newHouseholdName.trim()) {
      setError('Household name is required')
      return
    }

    try {
      setCreating(true)
      const result = await onCreateHousehold(newHouseholdName)
      
      if (result.success) {
        setNewHouseholdName('')
        setShowCreateForm(false)
      } else {
        setError(result.error || 'Failed to create household')
      }
    } catch (err) {
      setError(err.message || 'An error occurred')
    } finally {
      setCreating(false)
    }
  }

  const handleJoinHousehold = async (e) => {
    e.preventDefault()
    setError('')

    if (!inviteCode.trim()) {
      setError('Invite code is required')
      return
    }

    try {
      setCreating(true)
      const result = await onJoinHousehold(inviteCode)
      
      if (result.success) {
        setInviteCode('')
        setShowJoinForm(false)
      } else {
        setError(result.error || 'Failed to join household')
      }
    } catch (err) {
      setError(err.message || 'Invalid invite code')
    } finally {
      setCreating(false)
    }
  }

  const handleLeaveHousehold = async (householdId) => {
    try {
      setActionInProgress(householdId)
      const result = await onLeaveHousehold(householdId)
      
      if (!result.success) {
        setError(result.error || 'Failed to leave household')
      }
    } catch (err) {
      setError(err.message || 'Failed to leave household')
    } finally {
      setActionInProgress(null)
    }
  }

  const handleDeleteHousehold = async (householdId) => {
    try {
      setActionInProgress(householdId)
      const result = await onDeleteHousehold(householdId)
      
      if (!result.success) {
        setError(result.error || 'Failed to delete household')
      } else {
        setConfirmDelete(null)
      }
    } catch (err) {
      setError(err.message || 'Failed to delete household')
    } finally {
      setActionInProgress(null)
    }
  }

  if (isLoading) {
    return (
      <div className="household-selector">
        <div className="selector-loading">
          <div className="loading-spinner"></div>
          <p>Loading households...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="household-selector">
      <div className="selector-container">
        <div className="selector-header">
          <h2>Your Households</h2>
          <p>Select a household to manage or create a new one</p>
        </div>

        {households && households.length > 0 ? (
          <>
            <div className="households-list">
              {households.map((household) => (
                <div key={household.id} className="household-card-wrapper">
                  <button
                    className="household-card"
                    onClick={() => onSelectHousehold(household.id)}
                    disabled={actionInProgress !== null}
                  >
                    <div className="household-card-icon">🏠</div>
                    <div className="household-card-info">
                      <h3>{household.name}</h3>
                      <p className="household-meta">
                        {household.household_members?.length || 1} member{(household.household_members?.length || 1) !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <div className="household-card-arrow">→</div>
                  </button>

                  <div className="household-actions">
                    {confirmDelete === household.id ? (
                      <div className="confirm-delete">
                        <p>Delete this household?</p>
                        <div className="confirm-actions">
                          <button
                            className="btn-danger btn-sm"
                            onClick={() => handleDeleteHousehold(household.id)}
                            disabled={actionInProgress === household.id}
                          >
                            Yes, delete
                          </button>
                          <button
                            className="btn-secondary btn-sm"
                            onClick={() => setConfirmDelete(null)}
                            disabled={actionInProgress === household.id}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <button
                          className="action-btn leave-btn"
                          onClick={() => handleLeaveHousehold(household.id)}
                          disabled={actionInProgress !== null}
                          title="Leave this household"
                        >
                          👋
                        </button>
                        <button
                          className="action-btn delete-btn"
                          onClick={() => setConfirmDelete(household.id)}
                          disabled={actionInProgress !== null}
                          title="Delete this household"
                        >
                          🗑️
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="selector-divider">or</div>
          </>
        ) : null}

        {error && <div className="alert alert-error">{error}</div>}

        <div className="household-actions-section">
          {showCreateForm ? (
            <form onSubmit={handleCreateHousehold} className="action-form">
              <div className="form-group">
                <label htmlFor="householdName">New Household Name</label>
                <input
                  id="householdName"
                  type="text"
                  value={newHouseholdName}
                  onChange={(e) => setNewHouseholdName(e.target.value)}
                  placeholder="e.g., Main House, Cabin, Office"
                  autoFocus
                  disabled={creating}
                />
              </div>
              <div className="form-actions">
                <button 
                  type="submit" 
                  className="btn btn-primary"
                  disabled={creating}
                >
                  {creating ? 'Creating...' : 'Create Household'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowCreateForm(false)
                    setNewHouseholdName('')
                  }}
                  disabled={creating}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : showJoinForm ? (
            <form onSubmit={handleJoinHousehold} className="action-form">
              <div className="form-group">
                <label htmlFor="inviteCode">Invite Code</label>
                <input
                  id="inviteCode"
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  placeholder="e.g., HH_ABC123XYZ"
                  autoFocus
                  disabled={creating}
                />
              </div>
              <div className="form-actions">
                <button 
                  type="submit" 
                  className="btn btn-primary"
                  disabled={creating}
                >
                  {creating ? 'Joining...' : 'Join Household'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowJoinForm(false)
                    setInviteCode('')
                  }}
                  disabled={creating}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div className="quick-actions">
              <button 
                className="btn btn-primary btn-large"
                onClick={() => setShowCreateForm(true)}
              >
                + Create New Household
              </button>
              <button 
                className="btn btn-secondary btn-large"
                onClick={() => setShowJoinForm(true)}
              >
                🤝 Join Household
              </button>
            </div>
          )}
        </div>

        <div className="selector-footer">
          <p className="info-text">
            💡 Multiple households let you manage emergency supplies separately—perfect for vacation homes, offices, or shared spaces.
          </p>
        </div>
      </div>
    </div>
  )
}
