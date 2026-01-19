import {
  signUpLocal,
  signInLocal,
  signOutLocal,
  getCurrentUserLocal,
  isAuthenticatedLocal,
  getCurrentSessionLocal,
} from './localAuth'

let nhostClient = null
let NHOST_SUBDOMAIN = import.meta.env.VITE_NHOST_SUBDOMAIN || 'localhost'
let initPromise = null
let useLocalAuth = NHOST_SUBDOMAIN === 'localhost'

// Initialize Nhost client with proper async handling
const initNhost = async () => {
  try {
    if (NHOST_SUBDOMAIN === 'localhost') {
      console.log('[AUTH] Using local authentication (Nhost not configured)')
      return
    }

    // Dynamic import to avoid hard dependency
    try {
      const { NhostClient } = await import('@nhost/nhost-js')
      const NHOST_REGION = import.meta.env.VITE_NHOST_REGION || 'us-east-1'

      nhostClient = new NhostClient({
        subdomain: NHOST_SUBDOMAIN,
        region: NHOST_REGION,
        autoSignIn: false,
        autoRefreshToken: true,
      })
      useLocalAuth = false
      console.log('[AUTH] Nhost initialized successfully')
    } catch (importErr) {
      console.warn('[AUTH] Nhost package not available, falling back to local auth:', importErr.message)
      useLocalAuth = true
    }
  } catch (err) {
    console.warn('[AUTH] Initialization warning:', err.message)
    useLocalAuth = true
  }
}

// Start initialization immediately
initPromise = initNhost()

/**
 * Wait for Nhost initialization to complete
 */
const ensureNhostReady = async () => {
  if (initPromise) {
    await initPromise
  }
}

/**
 * Check if Nhost is configured
 */
export const isNhostConfigured = () => {
  return NHOST_SUBDOMAIN !== 'localhost'
}

/**
 * Sign in with email and password
 * Uses Nhost if configured, falls back to local auth
 */
export const signInWithNhost = async (email, password) => {
  try {
    await ensureNhostReady()

    if (useLocalAuth) {
      return signInLocal(email, password)
    }

    if (!nhostClient) {
      return signInLocal(email, password)
    }

    const { session, error } = await nhostClient.auth.signInWithEmail({
      email,
      password,
    })

    if (error) {
      throw error
    }

    return { session, error: null }
  } catch (error) {
    console.error('[AUTH] Sign in failed:', error)
    return { session: null, error }
  }
}

/**
 * Sign up with email and password
 * Uses Nhost if configured, falls back to local auth
 */
export const signUpWithNhost = async (email, password) => {
  try {
    await ensureNhostReady()

    if (useLocalAuth) {
      return signUpLocal(email, password)
    }

    if (!nhostClient) {
      return signUpLocal(email, password)
    }

    const { session, error } = await nhostClient.auth.signUpWithEmail({
      email,
      password,
    })

    if (error) {
      throw error
    }

    return { session, error: null }
  } catch (error) {
    console.error('[AUTH] Sign up failed:', error)
    return { session: null, error }
  }
}

/**
 * Sign out from Nhost or local auth
 */
export const signOutFromNhost = async () => {
  try {
    await ensureNhostReady()

    if (useLocalAuth) {
      return signOutLocal()
    }

    if (!nhostClient) {
      return signOutLocal()
    }

    await nhostClient.auth.signOut()
    return { error: null }
  } catch (error) {
    console.error('[AUTH] Sign out failed:', error)
    return { error }
  }
}

/**
 * Get current user from Nhost or local auth
 */
export const getNhostUser = () => {
  if (useLocalAuth) {
    return getCurrentUserLocal()
  }

  if (!nhostClient) return getCurrentUserLocal()
  return nhostClient.auth.getUser()
}

/**
 * Get Nhost auth status
 */
export const isNhostAuthenticated = () => {
  if (useLocalAuth) {
    return isAuthenticatedLocal()
  }

  if (!nhostClient) return isAuthenticatedLocal()
  return nhostClient.auth.isAuthenticated()
}

/**
 * Get Nhost session
 */
export const getNhostSession = () => {
  if (useLocalAuth) {
    return getCurrentSessionLocal()
  }

  if (!nhostClient) return getCurrentSessionLocal()
  return nhostClient.auth.getSession()
}

/**
 * Get GraphQL client from Nhost for custom queries
 */
export const getNhostGraphQLClient = async () => {
  await ensureNhostReady()
  if (!nhostClient) {
    throw new Error('Nhost not configured')
  }
  return nhostClient.graphql.request
}

/**
 * Create a new household for the current user
 */
export const createHousehold = async (householdName) => {
  try {
    await ensureNhostReady()

    if (useLocalAuth) {
      // In local auth mode, create household in localStorage
      const households = JSON.parse(localStorage.getItem('households') || '[]')
      const newHousehold = {
        id: `household_${Date.now()}_${Math.random()}`,
        name: householdName,
        created_at: new Date().toISOString(),
        owner_id: getCurrentUserLocal()?.id,
      }
      households.push(newHousehold)
      localStorage.setItem('households', JSON.stringify(households))
      return newHousehold
    }

    if (!nhostClient) {
      throw new Error('Nhost client not available')
    }

    // Query Nhost to create household
    const query = `
      mutation CreateHousehold($name: String!) {
        insert_households_one(object: { name: $name }) {
          id
          name
          created_at
          owner_id
        }
      }
    `

    const result = await nhostClient.graphql.request(query, {
      name: householdName,
    })

    if (result.errors) {
      throw new Error(result.errors[0]?.message || 'Failed to create household')
    }

    return result.data?.insert_households_one
  } catch (err) {
    console.error('[HOUSEHOLD] Error creating household:', err)
    throw err
  }
}

/**
 * Get all households for the current user
 */
export const getUserHouseholds = async () => {
  try {
    await ensureNhostReady()

    if (useLocalAuth) {
      // In local auth mode, get households from localStorage
      const households = JSON.parse(localStorage.getItem('households') || '[]')
      const currentUser = getCurrentUserLocal()
      return households.filter(h => h.owner_id === currentUser?.id)
    }

    if (!nhostClient) {
      throw new Error('Nhost client not available')
    }

    // Query Nhost for user's households
    const query = `
      query GetUserHouseholds {
        households {
          id
          name
          created_at
          owner_id
          household_members {
            id
            user_id
            household_id
            role
          }
        }
      }
    `

    const result = await nhostClient.graphql.request(query)

    if (result.errors) {
      throw new Error(result.errors[0]?.message || 'Failed to fetch households')
    }

    return result.data?.households || []
  } catch (err) {
    console.error('[HOUSEHOLD] Error fetching households:', err)
    return []
  }
}

/**
 * Invite a user to a household by email
 */
export const inviteUserToHousehold = async (householdId, userEmail) => {
  try {
    await ensureNhostReady()

    if (useLocalAuth) {
      // In local auth mode, not supported
      throw new Error('User invitations not supported in local auth mode')
    }

    if (!nhostClient) {
      throw new Error('Nhost client not available')
    }

    const mutation = `
      mutation InviteUserToHousehold($householdId: uuid!, $userEmail: String!) {
        insert_household_invitations_one(object: {
          household_id: $householdId
          invited_email: $userEmail
          status: "pending"
        }) {
          id
          household_id
          invited_email
          status
          created_at
        }
      }
    `

    const result = await nhostClient.graphql.request(mutation, {
      householdId,
      userEmail,
    })

    if (result.errors) {
      throw new Error(result.errors[0]?.message || 'Failed to invite user')
    }

    return result.data?.insert_household_invitations_one
  } catch (err) {
    console.error('[HOUSEHOLD] Error inviting user:', err)
    throw err
  }
}

/**
 * Join a household using an invite code
 */
export const joinHouseholdByCode = async (inviteCode) => {
  try {
    await ensureNhostReady()

    if (useLocalAuth) {
      // In local auth mode, simulate join
      const households = JSON.parse(localStorage.getItem('households') || '[]')
      const userHouseholds = JSON.parse(localStorage.getItem('userHouseholds') || '{}')
      const currentUser = getCurrentUserLocal()
      
      // Find household by code (simplified for local mode)
      const household = households.find(h => h.invite_code === inviteCode)
      if (!household) {
        throw new Error('Invalid invite code')
      }
      
      if (!userHouseholds[currentUser.id]) {
        userHouseholds[currentUser.id] = []
      }
      userHouseholds[currentUser.id].push({
        household_id: household.id,
        role: 'member'
      })
      localStorage.setItem('userHouseholds', JSON.stringify(userHouseholds))
      return household
    }

    if (!nhostClient) {
      throw new Error('Nhost client not available')
    }

    const mutation = `
      mutation JoinHouseholdByCode($inviteCode: String!) {
        joinHouseholdByCode(inviteCode: $inviteCode) {
          household {
            id
            name
            created_at
          }
        }
      }
    `

    const result = await nhostClient.graphql.request(mutation, {
      inviteCode,
    })

    if (result.errors) {
      throw new Error(result.errors[0]?.message || 'Failed to join household')
    }

    return result.data?.joinHouseholdByCode?.household
  } catch (err) {
    console.error('[HOUSEHOLD] Error joining household:', err)
    throw err
  }
}

/**
 * Leave a household
 */
export const leaveHousehold = async (householdId) => {
  try {
    await ensureNhostReady()

    if (useLocalAuth) {
      // In local auth mode, remove from userHouseholds
      const userHouseholds = JSON.parse(localStorage.getItem('userHouseholds') || '{}')
      const currentUser = getCurrentUserLocal()
      
      if (userHouseholds[currentUser.id]) {
        userHouseholds[currentUser.id] = userHouseholds[currentUser.id].filter(
          h => h.household_id !== householdId
        )
        localStorage.setItem('userHouseholds', JSON.stringify(userHouseholds))
      }
      return { success: true }
    }

    if (!nhostClient) {
      throw new Error('Nhost client not available')
    }

    const mutation = `
      mutation LeaveHousehold($householdId: uuid!) {
        delete_household_members(where: { household_id: { _eq: $householdId } }) {
          affected_rows
        }
      }
    `

    const result = await nhostClient.graphql.request(mutation, {
      householdId,
    })

    if (result.errors) {
      throw new Error(result.errors[0]?.message || 'Failed to leave household')
    }

    return { success: true }
  } catch (err) {
    console.error('[HOUSEHOLD] Error leaving household:', err)
    throw err
  }
}

/**
 * Delete a household (admin only)
 */
export const deleteHousehold = async (householdId) => {
  try {
    await ensureNhostReady()

    if (useLocalAuth) {
      // In local auth mode, delete from households
      const households = JSON.parse(localStorage.getItem('households') || '[]')
      const filtered = households.filter(h => h.id !== householdId)
      localStorage.setItem('households', JSON.stringify(filtered))
      
      // Also remove from all userHouseholds
      const userHouseholds = JSON.parse(localStorage.getItem('userHouseholds') || '{}')
      Object.keys(userHouseholds).forEach(userId => {
        userHouseholds[userId] = userHouseholds[userId].filter(
          h => h.household_id !== householdId
        )
      })
      localStorage.setItem('userHouseholds', JSON.stringify(userHouseholds))
      return { success: true }
    }

    if (!nhostClient) {
      throw new Error('Nhost client not available')
    }

    const mutation = `
      mutation DeleteHousehold($householdId: uuid!) {
        delete_households(where: { id: { _eq: $householdId } }) {
          affected_rows
        }
      }
    `

    const result = await nhostClient.graphql.request(mutation, {
      householdId,
    })

    if (result.errors) {
      throw new Error(result.errors[0]?.message || 'Failed to delete household')
    }

    return { success: true }
  } catch (err) {
    console.error('[HOUSEHOLD] Error deleting household:', err)
    throw err
  }
}

/**
 * Get invite code for a household (admin only)
 */
export const getHouseholdInviteCode = async (householdId) => {
  try {
    await ensureNhostReady()

    if (useLocalAuth) {
      // In local auth mode, generate a simple code
      const households = JSON.parse(localStorage.getItem('households') || '[]')
      const household = households.find(h => h.id === householdId)
      
      if (!household) {
        throw new Error('Household not found')
      }
      
      if (!household.invite_code) {
        household.invite_code = `HH_${Math.random().toString(36).substr(2, 9).toUpperCase()}`
        localStorage.setItem('households', JSON.stringify(households))
      }
      
      return household.invite_code
    }

    if (!nhostClient) {
      throw new Error('Nhost client not available')
    }

    const query = `
      query GetHouseholdInviteCode($householdId: uuid!) {
        households_by_pk(id: $householdId) {
          invite_code
        }
      }
    `

    const result = await nhostClient.graphql.request(query, {
      householdId,
    })

    if (result.errors) {
      throw new Error(result.errors[0]?.message || 'Failed to get invite code')
    }

    return result.data?.households_by_pk?.invite_code
  } catch (err) {
    console.error('[HOUSEHOLD] Error getting invite code:', err)
    throw err
  }
}

/**
 * Check if current user is first-time (no households)
 */
export const isFirstTimeUser = async () => {
  try {
    const households = await getUserHouseholds()
    return (!households || households.length === 0)
  } catch (err) {
    console.error('[HOUSEHOLD] Error checking first-time user status:', err)
    return true
  }
}

/**
 * Rename a household
 */
export const renameHousehold = async (householdId, newName) => {
  try {
    await ensureNhostReady()

    if (useLocalAuth) {
      // In local auth mode, update in localStorage
      const households = JSON.parse(localStorage.getItem('households') || '[]')
      const household = households.find(h => h.id === householdId)
      
      if (!household) {
        throw new Error('Household not found')
      }
      
      household.name = newName
      localStorage.setItem('households', JSON.stringify(households))
      return { ...household }
    }

    if (!nhostClient) {
      throw new Error('Nhost client not available')
    }

    const mutation = `
      mutation RenameHousehold($householdId: uuid!, $name: String!) {
        update_households(
          where: { id: { _eq: $householdId } }
          _set: { name: $name }
        ) {
          returning {
            id
            name
            created_at
          }
        }
      }
    `

    const result = await nhostClient.graphql.request(mutation, {
      householdId,
      name: newName,
    })

    if (result.errors) {
      throw new Error(result.errors[0]?.message || 'Failed to rename household')
    }

    return result.data?.update_households?.returning?.[0]
  } catch (err) {
    console.error('[HOUSEHOLD] Error renaming household:', err)
    throw err
  }
}

export default nhostClient
