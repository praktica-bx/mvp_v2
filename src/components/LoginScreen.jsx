import { useState } from 'react'
import { signInWithNhost, signUpWithNhost } from '../nhost'
import './LoginScreen.css'

export default function LoginScreen({ onAuthSuccess }) {
  const [mode, setMode] = useState('login') // 'login' or 'signup'
  const [usernameOrEmail, setUsernameOrEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)

    try {
      if (mode === 'login') {
        const { session, error: authError } = await signInWithNhost(usernameOrEmail, password)
        if (authError) {
          setError(authError.message || 'Failed to sign in. Check your credentials.')
          return
        }
        if (session) {
          setSuccess('Login successful! Redirecting...')
          setTimeout(() => onAuthSuccess(session), 500)
        }
      } else {
        // Sign up mode
        if (password !== confirmPassword) {
          setError('Passwords do not match')
          setLoading(false)
          return
        }
        if (password.length < 8) {
          setError('Password must be at least 8 characters')
          setLoading(false)
          return
        }

        const { session, error: authError } = await signUpWithNhost(usernameOrEmail, password)
        if (authError) {
          setError(authError.message || 'Failed to create account')
          return
        }
        if (session) {
          setSuccess('Account created! You are now logged in.')
          setTimeout(() => onAuthSuccess(session), 500)
        }
      }
    } catch (err) {
      setError(err.message || 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const toggleMode = () => {
    setMode(mode === 'login' ? 'signup' : 'login')
    setError('')
    setSuccess('')
    setUsernameOrEmail('')
    setPassword('')
    setConfirmPassword('')
  }

  return (
    <div className="login-screen">
      <div className="login-container">
        <div className="login-header">
          <h1>Emergency Supply Manager</h1>
          <p className="login-subtitle">Be prepared, stay safe</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="login-mode-header">
            <h2>{mode === 'login' ? 'Sign In' : 'Create Account'}</h2>
          </div>

          <div className="form-group">
            <label htmlFor="usernameOrEmail">Email</label>
            <input
              id="usernameOrEmail"
              type="email"
              value={usernameOrEmail}
              onChange={(e) => setUsernameOrEmail(e.target.value)}
              placeholder="your@email.com"
              required
              disabled={loading}
              autoComplete="email"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              disabled={loading}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </div>

          {mode === 'signup' && (
            <div className="form-group">
              <label htmlFor="confirmPassword">Confirm Password</label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
                disabled={loading}
                autoComplete="new-password"
              />
            </div>
          )}

          {error && <div className="alert alert-error">{error}</div>}
          {success && <div className="alert alert-success">{success}</div>}

          {mode === 'signup' && (
            <div className="password-requirements">
              <small>
                ✓ At least 8 characters
              </small>
            </div>
          )}

          <button type="submit" className="btn btn-primary btn-large" disabled={loading}>
            {loading ? (mode === 'login' ? 'Signing in...' : 'Creating account...') : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>

          <div className="login-divider">or</div>

          <button type="button" className="btn btn-secondary btn-large" onClick={toggleMode} disabled={loading}>
            {mode === 'login' ? 'Create new account' : 'Already have an account?'}
          </button>
        </form>

        <div className="login-footer">
          <p className="offline-note">
            💡 <strong>Tip:</strong> All your data stays on your device. You can use the app offline at any time.
          </p>
          <p className="privacy-note">
            By signing in, you agree to our terms and privacy policy.
          </p>
        </div>
      </div>
    </div>
  )
}
