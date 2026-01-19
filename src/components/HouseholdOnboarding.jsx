import { useState } from 'react'
import './HouseholdOnboarding.css'

export default function HouseholdOnboarding({ onCreateHousehold, onJoinHousehold, isLoading }) {
  const [step, setStep] = useState('choice') // 'choice', 'create', 'join', 'success'
  const [householdName, setHouseholdName] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [createdHousehold, setCreatedHousehold] = useState(null)

  const handleCreateHousehold = async (e) => {
    e.preventDefault()
    setError('')

    if (!householdName.trim()) {
      setError('Household name is required')
      return
    }

    try {
      setLoading(true)
      const result = await onCreateHousehold(householdName)
      
      if (result.success) {
        setCreatedHousehold(result.household)
        setStep('success')
      } else {
        setError(result.error || 'Failed to create household')
      }
    } catch (err) {
      setError(err.message || 'An error occurred')
    } finally {
      setLoading(false)
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
      setLoading(true)
      const result = await onJoinHousehold(inviteCode)
      
      if (result.success) {
        setStep('success')
      } else {
        setError(result.error || 'Failed to join household')
      }
    } catch (err) {
      setError(err.message || 'Invalid invite code')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="household-onboarding">
      <div className="onboarding-container">
        {step === 'choice' && (
          <>
            <div className="onboarding-header">
              <h1>Welcome to Emergency Supply Manager</h1>
              <p>Let's get you set up. What would you like to do?</p>
            </div>

            <div className="onboarding-choices">
              <button
                className="choice-card"
                onClick={() => setStep('create')}
                disabled={isLoading}
              >
                <div className="choice-icon">🏠</div>
                <h3>Create New Household</h3>
                <p>Start a new household and invite family or roommates to join</p>
                <div className="choice-arrow">→</div>
              </button>

              <div className="choice-divider">or</div>

              <button
                className="choice-card"
                onClick={() => setStep('join')}
                disabled={isLoading}
              >
                <div className="choice-icon">🤝</div>
                <h3>Join Existing Household</h3>
                <p>Join a household using an invite code from the household admin</p>
                <div className="choice-arrow">→</div>
              </button>
            </div>

            <div className="onboarding-footer">
              <p className="info-text">
                💡 Each household manages its own emergency supplies independently.
              </p>
            </div>
          </>
        )}

        {step === 'create' && (
          <>
            <div className="onboarding-header">
              <h2>Create a New Household</h2>
              <p>Give your household a name (e.g., "Main House", "Cabin", "Office")</p>
            </div>

            <form onSubmit={handleCreateHousehold} className="onboarding-form">
              <div className="form-group">
                <label htmlFor="householdName">Household Name</label>
                <input
                  id="householdName"
                  type="text"
                  value={householdName}
                  onChange={(e) => setHouseholdName(e.target.value)}
                  placeholder="e.g., Main House"
                  autoFocus
                  disabled={loading}
                />
              </div>

              {error && <div className="alert alert-error">{error}</div>}

              <div className="form-actions">
                <button 
                  type="submit" 
                  className="btn btn-primary"
                  disabled={loading}
                >
                  {loading ? 'Creating...' : 'Create Household'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setStep('choice')
                    setHouseholdName('')
                    setError('')
                  }}
                  disabled={loading}
                >
                  Back
                </button>
              </div>
            </form>
          </>
        )}

        {step === 'join' && (
          <>
            <div className="onboarding-header">
              <h2>Join a Household</h2>
              <p>Ask the household admin for the invite code</p>
            </div>

            <form onSubmit={handleJoinHousehold} className="onboarding-form">
              <div className="form-group">
                <label htmlFor="inviteCode">Invite Code</label>
                <input
                  id="inviteCode"
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  placeholder="e.g., HH_ABC123XYZ"
                  autoFocus
                  disabled={loading}
                />
              </div>

              {error && <div className="alert alert-error">{error}</div>}

              <div className="form-actions">
                <button 
                  type="submit" 
                  className="btn btn-primary"
                  disabled={loading}
                >
                  {loading ? 'Joining...' : 'Join Household'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setStep('choice')
                    setInviteCode('')
                    setError('')
                  }}
                  disabled={loading}
                >
                  Back
                </button>
              </div>
            </form>
          </>
        )}

        {step === 'success' && (
          <>
            <div className="success-container">
              <div className="success-icon">✓</div>
              <h2>All Set!</h2>
              <p>
                {createdHousehold
                  ? `Household "${createdHousehold.name}" created successfully.`
                  : 'You have successfully joined the household.'}
              </p>
              {createdHousehold && (
                <div className="invite-info">
                  <p className="info-label">Share this code with family/roommates:</p>
                  <div className="invite-code-display">
                    <code>HH_{Math.random().toString(36).substr(2, 9).toUpperCase()}</code>
                  </div>
                </div>
              )}
              <p className="next-text">You'll be redirected to your dashboard shortly...</p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
