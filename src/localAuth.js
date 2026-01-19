/**
 * Local authentication system using localStorage
 * Provides user registration and login without requiring a backend
 */

const USERS_STORAGE_KEY = 'emergency-supply-users'
const CURRENT_USER_KEY = 'emergency-supply-current-user'
const USERNAME_INDEX_KEY = 'emergency-supply-username-index' // Maps usernames to emails

/**
 * Hash password (simple hash for local use - NOT for production)
 * In production, use bcrypt or similar on server
 */
const hashPassword = (password) => {
  let hash = 0
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16)
}

/**
 * Get all users from localStorage
 */
const getAllUsers = () => {
  try {
    const users = localStorage.getItem(USERS_STORAGE_KEY)
    return users ? JSON.parse(users) : {}
  } catch (err) {
    console.error('[LOCAL_AUTH] Failed to read users:', err)
    return {}
  }
}

/**
 * Save users to localStorage
 */
const saveUsers = (users) => {
  try {
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users))
  } catch (err) {
    console.error('[LOCAL_AUTH] Failed to save users:', err)
  }
}

/**
 * Get username index (for fast lookup)
 */
const getUsernameIndex = () => {
  try {
    const index = localStorage.getItem(USERNAME_INDEX_KEY)
    return index ? JSON.parse(index) : {}
  } catch (err) {
    console.error('[LOCAL_AUTH] Failed to read username index:', err)
    return {}
  }
}

/**
 * Save username index
 */
const saveUsernameIndex = (index) => {
  try {
    localStorage.setItem(USERNAME_INDEX_KEY, JSON.stringify(index))
  } catch (err) {
    console.error('[LOCAL_AUTH] Failed to save username index:', err)
  }
}

/**
 * Check if input is an email
 */
const isEmail = (input) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input)
}

/**
 * Find user by username or email
 */
const findUser = (usernameOrEmail) => {
  const users = getAllUsers()
  const usernameIndex = getUsernameIndex()

  // Try direct email lookup first
  if (users[usernameOrEmail]) {
    return { user: users[usernameOrEmail], key: usernameOrEmail }
  }

  // Try username lookup
  const email = usernameIndex[usernameOrEmail]
  if (email && users[email]) {
    return { user: users[email], key: email }
  }

  return { user: null, key: null }
}

/**
 * Sign up a new user locally
 */
export const signUpLocal = async (usernameOrEmail, password) => {
  try {
    if (!usernameOrEmail || !password) {
      return {
        session: null,
        error: new Error('Username/email and password required'),
      }
    }

    if (password.length < 8) {
      return {
        session: null,
        error: new Error('Password must be at least 8 characters'),
      }
    }

    const users = getAllUsers()
    const usernameIndex = getUsernameIndex()

    // Determine if input is email or username
    const inputIsEmail = isEmail(usernameOrEmail)

    // Check if email already registered (if provided)
    if (inputIsEmail && users[usernameOrEmail]) {
      return {
        session: null,
        error: new Error('Email already registered'),
      }
    }

    // Check if username already taken
    if (!inputIsEmail && usernameIndex[usernameOrEmail]) {
      return {
        session: null,
        error: new Error('Username already taken'),
      }
    }

    // Create new user
    const userId = 'local_' + Date.now()
    const userData = {
      id: userId,
      passwordHash: hashPassword(password),
      createdAt: new Date().toISOString(),
    }

    if (inputIsEmail) {
      userData.email = usernameOrEmail
      users[usernameOrEmail] = userData
    } else {
      // For username-only signup, create a synthetic email for internal use
      const syntheticEmail = `${usernameOrEmail}@local`
      userData.email = syntheticEmail
      userData.username = usernameOrEmail
      users[syntheticEmail] = userData
      usernameIndex[usernameOrEmail] = syntheticEmail
      saveUsernameIndex(usernameIndex)
    }

    saveUsers(users)

    // Create session
    const session = {
      user: {
        id: userId,
        username: userData.username || usernameOrEmail,
        email: userData.email,
      },
      createdAt: new Date().toISOString(),
    }

    // Save current user
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(session))

    console.log('[LOCAL_AUTH] User registered:', usernameOrEmail)
    return { session, error: null }
  } catch (err) {
    console.error('[LOCAL_AUTH] Sign up failed:', err)
    return { session: null, error: err }
  }
}

/**
 * Sign in a user locally
 */
export const signInLocal = async (usernameOrEmail, password) => {
  try {
    if (!usernameOrEmail || !password) {
      return {
        session: null,
        error: new Error('Username/email and password required'),
      }
    }

    const { user, key } = findUser(usernameOrEmail)

    if (!user || user.passwordHash !== hashPassword(password)) {
      return {
        session: null,
        error: new Error('Invalid username, email, or password'),
      }
    }

    // Create session
    const session = {
      user: {
        id: user.id,
        username: user.username || usernameOrEmail,
        email: user.email,
      },
      createdAt: new Date().toISOString(),
    }

    // Save current user
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(session))

    console.log('[LOCAL_AUTH] User signed in:', usernameOrEmail)
    return { session, error: null }
  } catch (err) {
    console.error('[LOCAL_AUTH] Sign in failed:', err)
    return { session: null, error: err }
  }
}

/**
 * Sign out current user
 */
export const signOutLocal = async () => {
  try {
    localStorage.removeItem(CURRENT_USER_KEY)
    console.log('[LOCAL_AUTH] User signed out')
    return { error: null }
  } catch (err) {
    console.error('[LOCAL_AUTH] Sign out failed:', err)
    return { error: err }
  }
}

/**
 * Get current user session
 */
export const getCurrentSessionLocal = () => {
  try {
    const session = localStorage.getItem(CURRENT_USER_KEY)
    return session ? JSON.parse(session) : null
  } catch (err) {
    console.error('[LOCAL_AUTH] Failed to get session:', err)
    return null
  }
}

/**
 * Get current user
 */
export const getCurrentUserLocal = () => {
  const session = getCurrentSessionLocal()
  return session ? session.user : null
}

/**
 * Check if user is authenticated locally
 */
export const isAuthenticatedLocal = () => {
  return getCurrentSessionLocal() !== null
}
