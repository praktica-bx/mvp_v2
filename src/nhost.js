// ============================================================================
// STORAGE LOCATIONS CLOUD SYNC
// ============================================================================

export const fetchStorageLocations = async (householdId) => {
  await ensureNhostReady();
  if (useLocalAuth || !nhostClient) return [];
  const query = `
    query GetStorageLocations($householdId: uuid!) {
      storage_locations(where: { household_id: { _eq: $householdId } }, order_by: { created_at: asc }) {
        id
        name
        household_id
        user_id
        created_at
      }
    }
  `;
  const result = await nhostClient.graphql.request({ query, variables: { householdId } });
  if (result.errors) throw new Error(result.errors[0]?.message || 'Failed to fetch storage locations');
  return (result.body || result).data?.storage_locations || [];
};

export const insertStorageLocation = async (householdId, name) => {
  await ensureNhostReady();
  if (useLocalAuth || !nhostClient) return null;
  const user = getNhostUser();
  if (!user) throw new Error('Not authenticated');
  const mutation = `
    mutation InsertStorageLocation($householdId: uuid!, $userId: uuid!, $name: String!) {
      insert_storage_locations_one(object: { household_id: $householdId, user_id: $userId, name: $name }) {
        id
        name
        household_id
        user_id
        created_at
      }
    }
  `;
  const result = await nhostClient.graphql.request({ query: mutation, variables: { householdId, userId: user.id, name } });
  if (result.errors) throw new Error(result.errors[0]?.message || 'Failed to insert storage location');
  return (result.body || result).data?.insert_storage_locations_one || null;
};

export const updateStorageLocation = async (id, name) => {
  await ensureNhostReady();
  if (useLocalAuth || !nhostClient) return null;
  const mutation = `
    mutation UpdateStorageLocation($id: uuid!, $name: String!) {
      update_storage_locations_by_pk(pk_columns: { id: $id }, _set: { name: $name }) {
        id
        name
        household_id
        user_id
        created_at
      }
    }
  `;
  const result = await nhostClient.graphql.request({ query: mutation, variables: { id, name } });
  if (result.errors) throw new Error(result.errors[0]?.message || 'Failed to update storage location');
  return (result.body || result).data?.update_storage_locations_by_pk || null;
};

export const deleteStorageLocation = async (id) => {
  await ensureNhostReady();
  if (useLocalAuth || !nhostClient) return null;
  const mutation = `
    mutation DeleteStorageLocation($id: uuid!) {
      delete_storage_locations_by_pk(id: $id) {
        id
      }
    }
  `;
  const result = await nhostClient.graphql.request({ query: mutation, variables: { id } });
  if (result.errors) throw new Error(result.errors[0]?.message || 'Failed to delete storage location');
  return (result.body || result).data?.delete_storage_locations_by_pk || null;
};

/**
 * Upsert theme setting for the current user/household in Nhost
 * @param {string} theme - Theme name (e.g., 'light', 'dark')
 * @param {string|null} householdId - Household ID (optional)
 */
export const upsertThemeSetting = async (theme, householdId = null) => {
  await ensureNhostReady();
  if (useLocalAuth || !nhostClient) return null;
  const user = getNhostUser();
  if (!user) throw new Error('Not authenticated');
  const mutation = `
    mutation UpsertUserSettings($userId: uuid!, $householdId: uuid, $settings: jsonb!) {
      insert_user_settings_one(
        object: { user_id: $userId, household_id: $householdId, settings: $settings },
        on_conflict: { constraint: user_settings_user_id_household_id_key, update_columns: [settings, updated_at] }
      ) {
        id
        settings
        updated_at
      }
    }
  `;
  const variables = {
    userId: user.id,
    householdId,
    settings: { theme },
  };
  const result = await nhostClient.graphql.request({ query: mutation, variables });
  if (result.errors) throw new Error(result.errors[0]?.message || 'Failed to upsert theme');
  return (result.body || result).data?.insert_user_settings_one?.settings?.theme || null;
};

/**
 * Fetch theme setting for the current user/household from Nhost
 * @param {string|null} householdId - Household ID (optional)
 */
export const fetchThemeSetting = async (householdId = null) => {
  await ensureNhostReady();
  if (useLocalAuth || !nhostClient) return null;
  const user = getNhostUser();
  if (!user) throw new Error('Not authenticated');
  const query = `
    query GetUserSettings($userId: uuid!, $householdId: uuid) {
      user_settings(where: { user_id: { _eq: $userId }, household_id: { _eq: $householdId } }) {
        settings
        updated_at
      }
    }
  `;
  const variables = { userId: user.id, householdId };
  const result = await nhostClient.graphql.request({ query, variables });
  if (result.errors) throw new Error(result.errors[0]?.message || 'Failed to fetch theme');
  const settings = (result.body || result).data?.user_settings?.[0]?.settings;
  return settings?.theme || null;
};
// Field Preferences Cloud Sync (user_settings table)
/**
 * Upsert field preferences for the current user/household in Nhost
 * @param {object} preferences - Field preferences object
 * @param {string} householdId - Household ID (optional, for per-household prefs)
 */
export const upsertFieldPreferences = async (preferences, householdId = null) => {
  await ensureNhostReady();
  if (useLocalAuth || !nhostClient) return null;
  const user = getNhostUser();
  if (!user) throw new Error('Not authenticated');
  const mutation = `
    mutation UpsertUserSettings($userId: uuid!, $householdId: uuid, $settings: jsonb!) {
      insert_user_settings_one(
        object: { user_id: $userId, household_id: $householdId, settings: $settings }, 
        on_conflict: { constraint: user_settings_user_id_household_id_key, update_columns: [settings, updated_at] }
      ) {
        id
        settings
        updated_at
      }
    }
  `;
  const variables = {
    userId: user.id,
    householdId,
    settings: { fieldPreferences: preferences },
  };
  const result = await nhostClient.graphql.request({ query: mutation, variables });
  if (result.errors) throw new Error(result.errors[0]?.message || 'Failed to upsert field preferences');
  return (result.body || result).data?.insert_user_settings_one?.settings?.fieldPreferences || null;
};

/**
 * Fetch field preferences for the current user/household from Nhost
 * @param {string} householdId - Household ID (optional, for per-household prefs)
 */
export const fetchFieldPreferences = async (householdId = null) => {
  await ensureNhostReady();
  if (useLocalAuth || !nhostClient) return null;
  const user = getNhostUser();
  if (!user) throw new Error('Not authenticated');
  const query = `
    query GetUserSettings($userId: uuid!, $householdId: uuid) {
      user_settings(where: { user_id: { _eq: $userId }, household_id: { _eq: $householdId } }) {
        settings
        updated_at
      }
    }
  `;
  const variables = { userId: user.id, householdId };
  const result = await nhostClient.graphql.request({ query, variables });
  if (result.errors) throw new Error(result.errors[0]?.message || 'Failed to fetch field preferences');
  const settings = (result.body || result).data?.user_settings?.[0]?.settings;
  return settings?.fieldPreferences || null;
};
import {
  signUpLocal,
  signInLocal,
  signOutLocal,
  getCurrentUserLocal,
  isAuthenticatedLocal,
  getCurrentSessionLocal,
} from './localAuth'

let nhostClient = null
// Prefer Vite env, but allow runtime override via window.__VITE_NHOST_SUBDOMAIN (useful for tests)
let NHOST_SUBDOMAIN = (typeof window !== 'undefined' && window.__VITE_NHOST_SUBDOMAIN) ||
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_NHOST_SUBDOMAIN) ||
  'localhost'
let NHOST_REGION = (typeof window !== 'undefined' && window.__VITE_NHOST_REGION) || (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_NHOST_REGION) || 'us-east-1'
let initPromise = null
let useLocalAuth = NHOST_SUBDOMAIN === 'localhost'

// Debug: log resolved environment values so we can diagnose why Nhost falls back to localhost
try {
  console.info('[AUTH DEBUG] window.__VITE_NHOST_SUBDOMAIN =', (typeof window !== 'undefined' && window.__VITE_NHOST_SUBDOMAIN))
  console.info('[AUTH DEBUG] import.meta.env.VITE_NHOST_SUBDOMAIN =', (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_NHOST_SUBDOMAIN))
  console.info('[AUTH DEBUG] Resolved NHOST_SUBDOMAIN =', NHOST_SUBDOMAIN)
  console.info('[AUTH DEBUG] Resolved NHOST_REGION =', NHOST_REGION)
} catch (e) {
  // ignore in non-browser contexts
}

// Initialize Nhost client with proper async handling
const initNhost = async () => {
  try {
    if (NHOST_SUBDOMAIN === 'localhost') {
      console.log('[AUTH] Using local authentication (Nhost not configured)')
      return
    }

    // Dynamic import to avoid hard dependency and handle different export shapes
    try {
      const mod = await import('@nhost/nhost-js')
      console.log('[AUTH] nhost module exports:', Object.keys(mod || {}).slice(0,10))
      const NHOST_REGION = (typeof window !== 'undefined' && window.__VITE_NHOST_REGION) || (import.meta.env && import.meta.env.VITE_NHOST_REGION) || 'us-east-1'

      // Prefer `createClient` over `createNhostClient` — createClient adds withClientSideSessionMiddleware
      // which attaches the Bearer token to all requests and handles auto token refresh.
      const clientFactory = mod.createClient || mod.createNhostClient || mod.NhostClient || (mod.default && (mod.default.createClient || mod.default.createNhostClient || mod.default.NhostClient || mod.default)) || null

      if (!clientFactory) {
        throw new Error('Nhost client constructor/factory not found in @nhost/nhost-js export')
      }

      // Try factory/callable first
      try {
        if (typeof clientFactory === 'function') {
          // Some factories expect an options object
          nhostClient = clientFactory({
            subdomain: NHOST_SUBDOMAIN,
            region: NHOST_REGION,
          })
        } else {
          // Fallback: attempt to construct
          nhostClient = new clientFactory({
            subdomain: NHOST_SUBDOMAIN,
            region: NHOST_REGION,
          })
        }
      } catch (initErr) {
        throw new Error('Failed to initialize Nhost client: ' + (initErr.message || initErr))
      }

      // Validate that the created client exposes auth methods we expect. If not, prefer local auth.
      try {
        const authKeys = nhostClient && nhostClient.auth ? Object.keys(nhostClient.auth) : []
        const hasSignUp = authKeys.some(k => /sign.?up/i.test(k))
        const hasSignIn = authKeys.some(k => /sign.?in/i.test(k))
        if (!hasSignUp || !hasSignIn) {
          console.warn('[AUTH] Nhost client created but missing expected auth methods, falling back to local auth. auth keys:', authKeys)
          nhostClient = null
          useLocalAuth = true
          return
        }
      } catch (chkErr) {
        console.warn('[AUTH] Error checking nhost client auth methods, falling back to local auth:', chkErr && chkErr.message ? chkErr.message : chkErr)
        nhostClient = null
        useLocalAuth = true
        return
      }

      useLocalAuth = false
      console.log('[AUTH] Nhost initialized successfully')
    } catch (importErr) {
      console.warn('[AUTH] Nhost package not available or init failed, falling back to local auth:', importErr && importErr.message ? importErr.message : importErr)
      useLocalAuth = true
    }
  } catch (err) {
    console.warn('[AUTH] Initialization warning:', err.message)
    useLocalAuth = true
  }
}

// Generic retry wrapper for network requests
const retryRequest = async (fn, { retries = 3, delay = 500 } = {}) => {
  let attempt = 0
  let wait = delay
  while (true) {
    try {
      return await fn()
    } catch (err) {
      attempt++
      const isLast = attempt >= retries
      console.warn(`[RETRY] attempt ${attempt} failed${isLast ? ' (last)' : ''}:`, err && err.message ? err.message : err)
      if (isLast) throw err
      await new Promise((res) => setTimeout(res, wait))
      wait *= 2
    }
  }
}

// Start initialization immediately
initPromise = initNhost()

/**
 * Wait for Nhost initialization to complete
 */
export const ensureNhostReady = async () => {
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

    // Support multiple nhost client API shapes by trying known method names
    const tryAuthMethods = async (methodNames, payload) => {
      if (!nhostClient || !nhostClient.auth) throw new Error('Nhost client not available')
      for (const name of methodNames) {
        const fn = nhostClient.auth[name]
        if (typeof fn === 'function') {
          try {
            const result = await fn.call(nhostClient.auth, payload)
            return result
          } catch (err) {
            // If the method exists but errors, rethrow to allow outer catch to handle retries/logging
            throw err
          }
        }
      }
      throw new Error('No supported sign-in method found on nhost client')
    }

    try {
      // v4 uses signInEmailPassword({ email, password }) → { body: { session, user }, status }
      // v2/v3 used signInWithEmail/signIn → { session, error }
      const result = await tryAuthMethods(['signInEmailPassword', 'signInWithEmail', 'signIn', 'signInWithPassword', 'signInWithEmailAndPassword'], { email, password })
      // Normalize result across SDK versions
      if (result && result.error) throw result.error
      // v4 shape: { body: { session, user }, status }
      if (result && result.body) {
        const { session, user } = result.body
        if (session) nhostClient.sessionStorage.set(session)
        // Store user separately — sessionStorage only keeps token info and gets overwritten by refresh middleware
        if (user) localStorage.setItem('nhostUser', JSON.stringify(user))
        return { session: { ...session, user }, error: null }
      }
      // v2/v3 shape: { session, ... }
      const session = result && (result.session || result)
      return { session, error: null }
    } catch (err) {
      if (err && /No supported sign-in method/i.test(err.message)) {
        console.warn('[AUTH] Nhost client has no supported sign-in methods, falling back to local auth. Available auth keys:', nhostClient && nhostClient.auth ? Object.keys(nhostClient.auth) : null)
        return signInLocal(email, password)
      }
      throw err
    }
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

    // Try multiple possible sign-up method names across nhost client versions
    const trySignUpMethods = async (methodNames, payload) => {
      if (!nhostClient || !nhostClient.auth) throw new Error('Nhost client not available')
      for (const name of methodNames) {
        const fn = nhostClient.auth[name]
        if (typeof fn === 'function') {
          try {
            const result = await fn.call(nhostClient.auth, payload)
            return result
          } catch (err) {
            throw err
          }
        }
      }
      throw new Error('No supported sign-up method found on nhost client')
    }

    try {
      // v4: signUpEmailPassword({ email, password }) → { body: { session, user }, status }
      const result = await trySignUpMethods(['signUpEmailPassword', 'signUpWithEmail', 'signUp', 'register', 'signUpWithEmailAndPassword'], { email, password })
      if (result && result.error) throw result.error
      // v4 shape
      if (result && result.body) {
        const { session, user } = result.body
        if (session) nhostClient.sessionStorage.set(session)
        // Store user separately — survives token refreshes
        if (user) localStorage.setItem('nhostUser', JSON.stringify(user))
        return { session: { ...session, user }, error: null }
      }
      const session = result && (result.session || result)
      return { session, error: null }
    } catch (err) {
      // If the nhost client doesn't expose expected signup methods, fall back to local auth
      if (err && /No supported sign-up method/i.test(err.message)) {
        console.warn('[AUTH] Nhost client has no supported sign-up methods, falling back to local auth. Available auth keys:', nhostClient && nhostClient.auth ? Object.keys(nhostClient.auth) : null)
        return signUpLocal(email, password)
      }
      throw err
    }
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

    // v4: signOut is a direct auth method, also clear session storage
    if (typeof nhostClient.auth.signOut === 'function') {
      try {
        await nhostClient.auth.signOut()
      } catch (e) {
        console.warn('[AUTH] signOut request failed (ignoring):', e.message)
      }
    }
    if (nhostClient.sessionStorage) nhostClient.sessionStorage.remove()
    localStorage.removeItem('nhostUser')
    return { error: null }
  } catch (error) {
    console.error('[AUTH] Sign out failed:', error)
    return { error }
  }
}

/**
 * Get current user from Nhost or local auth
 * In v4, user info is stored in a separate localStorage key after sign-in
 */
export const getNhostUser = () => {
  if (useLocalAuth) {
    return getCurrentUserLocal()
  }

  if (!nhostClient) return getCurrentUserLocal()
  // v4: user is stored separately in localStorage (sessionStorage only keeps tokens)
  const session = nhostClient.sessionStorage ? nhostClient.sessionStorage.get() : null
  if (!session) return null
  // 1. Try localStorage (written at sign-in)
  try {
    const stored = JSON.parse(localStorage.getItem('nhostUser') || 'null')
    if (stored && stored.id) return stored
  } catch {}
  // 2. Fall back to session.user (some SDK versions embed it)
  if (session.user && session.user.id) {
    // Cache it for next calls
    try { localStorage.setItem('nhostUser', JSON.stringify(session.user)) } catch {}
    return session.user
  }
  return null
}

/**
 * Get Nhost auth status
 * In v4, isAuthenticated() doesn't exist — check sessionStorage instead
 */
export const isNhostAuthenticated = () => {
  if (useLocalAuth) {
    return isAuthenticatedLocal()
  }

  if (!nhostClient) return isAuthenticatedLocal()
  // v4: check for a stored valid session
  try {
    const session = nhostClient.sessionStorage ? nhostClient.sessionStorage.get() : null
    return session !== null && session !== undefined
  } catch {
    return false
  }
}

/**
 * Get Nhost session
 * In v4, the session is stored in sessionStorage
 */
export const getNhostSession = () => {
  if (useLocalAuth) {
    return getCurrentSessionLocal()
  }

  if (!nhostClient) return getCurrentSessionLocal()
  return nhostClient.sessionStorage ? nhostClient.sessionStorage.get() : null
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
 * Create a household in localStorage (offline / cloud-unreachable fallback)
 * Tagged with _pendingSync so it gets pushed when the cloud comes back.
 */
const createHouseholdLocally = (householdName) => {
  const user = getNhostUser() || {}
  const ownerId = user.id || `local_${Date.now()}`
  const id = `household_${Date.now()}_${Math.random().toString(36).slice(2)}`
  const newHousehold = {
    id,
    name: householdName,
    created_at: new Date().toISOString(),
    owner_id: ownerId,
    _pendingSync: true,
    household_members: [
      {
        id: `hm_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        user_id: ownerId,
        household_id: id,
        role: 'admin',
        email: user.email || null,
        name: user.displayName || null,
      },
    ],
  }
  const existing = JSON.parse(localStorage.getItem('pendingHouseholds') || '[]')
  existing.push(newHousehold)
  localStorage.setItem('pendingHouseholds', JSON.stringify(existing))
  return newHousehold
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
      const id = `household_${Date.now()}_${Math.random()}`
      const ownerId = getCurrentUserLocal()?.id
      const ownerEmail = getCurrentUserLocal()?.email || null
      const newHousehold = {
        id,
        name: householdName,
        created_at: new Date().toISOString(),
        owner_id: ownerId,
        household_members: [
          {
            id: `hm_${Date.now()}_${Math.random()}`,
            user_id: ownerId,
            household_id: id,
            role: 'admin',
            email: ownerEmail,
            name: getCurrentUserLocal()?.username || null,
          }
        ]
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

    const result = await nhostClient.graphql.request({
      query,
      variables: {
        name: householdName,
      },
    })

    if (result.errors) {
      throw new Error(result.errors[0]?.message || 'Failed to create household')
    }

    return (result.body || result).data?.insert_households_one
  } catch (err) {
    console.error('[HOUSEHOLD] Error creating household:', err)
    // If this is a network failure (cloud unreachable) fall back to a local household
    // so the user is not blocked. It will be synced when the cloud comes back.
    const isNetworkErr = err instanceof TypeError || (err.message && /network|fetch|cors|failed to fetch/i.test(err.message))
    if (isNetworkErr) {
      console.warn('[HOUSEHOLD] Network unreachable — creating household locally (will sync later)')
      return createHouseholdLocally(householdName)
    }
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
      const userHouseholds = households.filter(h => h.owner_id === currentUser?.id)

      // If no households exist for this local user, create a default one to simplify first-time setup
      if ((!userHouseholds || userHouseholds.length === 0) && currentUser) {
        const id = `household_${Date.now()}_${Math.random()}`
        const newHousehold = {
          id,
          name: 'My Household',
          created_at: new Date().toISOString(),
          owner_id: currentUser.id,
          household_members: [
            {
              id: `hm_${Date.now()}_${Math.random()}`,
              user_id: currentUser.id,
              household_id: id,
              role: 'admin',
              email: currentUser.email || null,
              name: currentUser.username || null,
            }
          ]
        }
        households.push(newHousehold)
        localStorage.setItem('households', JSON.stringify(households))
        return [newHousehold]
      }

      return userHouseholds
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

    const result = await nhostClient.graphql.request({ query })

    if (result.errors) {
      throw new Error(result.errors[0]?.message || 'Failed to fetch households')
    }

    const cloudHouseholds = (result.body || result).data?.households || []

    // Merge in any households that were created locally while offline
    // (those will be missing from the cloud until sync runs)
    // Only include pending households with valid UUIDs — legacy local-only IDs are not cloud-compatible
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    const pending = JSON.parse(localStorage.getItem('pendingHouseholds') || '[]').filter(h => UUID_RE.test(h.id))
    const merged = [...cloudHouseholds]
    for (const ph of pending) {
      if (!merged.some((h) => h.id === ph.id)) {
        merged.push(ph)
      }
    }

    return merged
  } catch (err) {
    console.error('[HOUSEHOLD] Error fetching households:', err)
    // On network failure, return locally-created pending households so user is not left empty
    const pending = JSON.parse(localStorage.getItem('pendingHouseholds') || '[]')
    if (pending.length > 0) {
      console.warn('[HOUSEHOLD] Cloud unreachable \u2014 returning locally-pending households')
      return pending
    }
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

    const result = await nhostClient.graphql.request({
      query: mutation,
      variables: {
        householdId,
        userEmail,
      },
    })

    if (result.errors) {
      throw new Error(result.errors[0]?.message || 'Failed to invite user')
    }

    return (result.body || result).data?.insert_household_invitations_one
  } catch (err) {
    console.error('[HOUSEHOLD] Error inviting user:', err)
    throw err
  }
}

/**
 * Remove a member from a household
 * memberId: the id of the household_members row or the user_id
 */
export const removeHouseholdMember = async (householdId, memberId) => {
  try {
    await ensureNhostReady()

    if (useLocalAuth) {
      // try to remove from households household_members array if present
      const households = JSON.parse(localStorage.getItem('households') || '[]')
      const household = households.find(h => h.id === householdId)
      if (household && household.household_members) {
        household.household_members = household.household_members.filter(m => (m.id !== memberId && m.user_id !== memberId))
        localStorage.setItem('households', JSON.stringify(households))
      }
      return { success: true }
    }

    if (!nhostClient) {
      throw new Error('Nhost client not available')
    }

    // First try deleting by household_member id
    const mutationById = `
      mutation RemoveHouseholdMemberById($memberId: uuid!, $householdId: uuid!) {
        delete_household_members(where: { id: { _eq: $memberId }, household_id: { _eq: $householdId } }) {
          affected_rows
        }
      }
    `

    let result = await nhostClient.graphql.request({
      query: mutationById,
      variables: {
        memberId,
        householdId,
      },
    })

    if (result.errors) {
      // continue to try by user_id fallback
    }

    const affected = (result.body || result).data?.delete_household_members?.affected_rows || 0
    if (affected > 0) return { success: true }

    // Fallback: try delete by user_id
    const mutationByUser = `
      mutation RemoveHouseholdMemberByUser($userId: String!, $householdId: uuid!) {
        delete_household_members(where: { user_id: { _eq: $userId }, household_id: { _eq: $householdId } }) {
          affected_rows
        }
      }
    `

    result = await nhostClient.graphql.request({
      query: mutationByUser,
      variables: {
        userId: memberId,
        householdId,
      },
    })

    if (result.errors) {
      throw new Error(result.errors[0]?.message || 'Failed to remove member')
    }

    return { success: ((result.body || result).data?.delete_household_members?.affected_rows || 0) > 0 }
  } catch (err) {
    console.error('[HOUSEHOLD] Error removing household member:', err)
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

    const result = await nhostClient.graphql.request({ query: mutation, variables: { inviteCode } })

    if (result.errors) {
      throw new Error(result.errors[0]?.message || 'Failed to join household')
    }

    return (result.body || result).data?.joinHouseholdByCode?.household
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

    const result = await nhostClient.graphql.request({
      query: mutation,
      variables: {
        householdId,
      },
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

    const result = await nhostClient.graphql.request({
      query: mutation,
      variables: {
        householdId,
      },
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

    const result = await nhostClient.graphql.request({ query, variables: { householdId } })

    if (result.errors) {
      throw new Error(result.errors[0]?.message || 'Failed to get invite code')
    }

    return (result.body || result).data?.households_by_pk?.invite_code
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

    const result = await nhostClient.graphql.request({
      query: mutation,
      variables: {
        householdId,
        name: newName,
      },
    })

    if (result.errors) {
      throw new Error(result.errors[0]?.message || 'Failed to rename household')
    }

    return (result.body || result).data?.update_households?.returning?.[0]
  } catch (err) {
    console.error('[HOUSEHOLD] Error renaming household:', err)
    throw err
  }
}

/**
 * Upsert a batch of inventory items to the server.
 * Expects an array of objects matching the server inventory input shape.
 */
export const upsertInventoryBatch = async (items = []) => {
  try {
    await ensureNhostReady()

    if (useLocalAuth) {
      throw new Error('Nhost not configured: cannot upsert inventory in local mode')
    }

    if (!nhostClient) throw new Error('Nhost client not available')

    const mutation = `
      mutation UpsertInventory($objects: [inventory_insert_input!]!) {
        insert_inventory(objects: $objects, on_conflict: { constraint: inventory_pkey, update_columns: [product_name,product_id,quantity,unit,expiry_date,added_at,updated_at,storage_location,_deleted,allowGracePeriod,gracePeriodMonths,image_url] }) {
          returning {
            id
            updated_at
          }
        }
      }
    `

    const call = async () => await nhostClient.graphql.request({ query: mutation, variables: { objects: items } })
    const result = await retryRequest(call, { retries: 3, delay: 400 })
    if (result.errors) {
      const msg = result.errors[0]?.message || 'Failed to upsert inventory batch'
      console.error('[SYNC] upsertInventoryBatch graphql errors:', result.errors)
      throw new Error(msg)
    }

    const returning = (result.body || result).data?.insert_inventory?.returning || []
    console.log(`[SYNC] upsertInventoryBatch: requested=${items.length} returned=${returning.length}`)
    return returning
  } catch (err) {
    console.error('[SYNC] upsertInventoryBatch error:', err)
    throw err
  }
}

/**
 * Delete a batch of inventory records on the server by id
 */
export const deleteInventoryBatch = async (ids = []) => {
  try {
    await ensureNhostReady()

    if (useLocalAuth) {
      throw new Error('Nhost not configured: cannot delete inventory in local mode')
    }

    if (!nhostClient) throw new Error('Nhost client not available')

    const mutation = `
      mutation DeleteInventory($ids: [uuid!]) {
        delete_inventory(where: { id: { _in: $ids } }) {
          affected_rows
        }
      }
    `

    const call = async () => await nhostClient.graphql.request({ query: mutation, variables: { ids } })
    const result = await retryRequest(call, { retries: 3, delay: 400 })
    if (result.errors) {
      console.error('[SYNC] deleteInventoryBatch graphql errors:', result.errors)
      throw new Error(result.errors[0]?.message || 'Failed to delete inventory batch')
    }

    const data = (result.body || result).data?.delete_inventory || { affected_rows: 0 }
    console.log(`[SYNC] deleteInventoryBatch: requested=${ids.length} affected=${data.affected_rows || 0}`)
    return data
  } catch (err) {
    console.error('[SYNC] deleteInventoryBatch error:', err)
    throw err
  }
}

/**
 * Get inventory rows changed since a timestamp (ISO string)
 */
export const getInventoryChangesSince = async (sinceISO, householdId) => {
  try {
    await ensureNhostReady()
    if (useLocalAuth) return []
    if (!nhostClient) throw new Error('Nhost client not available')
    // Skip if householdId is not a valid UUID (e.g. legacy locally-generated ID)
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!householdId || !UUID_RE.test(householdId)) {
      console.warn('[SYNC] Skipping getInventoryChangesSince — householdId is not a UUID:', householdId)
      return []
    }

    const query = `
      query InventoryChanges($since: timestamptz!, $householdId: uuid!) {
        inventory(where: { household_id: { _eq: $householdId }, updated_at: { _gt: $since } }) {
          id
          household_id
          product_id
          product_name
          quantity
          unit
          expiry_date
          storage_location
          added_at
          updated_at
          _deleted
          allowGracePeriod
          gracePeriodMonths
          image_url
        }
      }
    `

    const call = async () => await nhostClient.graphql.request({ query, variables: { since: sinceISO, householdId } })
    const result = await retryRequest(call, { retries: 2, delay: 300 })
    if (result.errors) {
      console.error('[SYNC] getInventoryChangesSince graphql errors:', result.errors)
      throw new Error(result.errors[0]?.message || 'Failed to fetch inventory changes')
    }
    return (result.body || result).data?.inventory || []
  } catch (err) {
    console.error('[SYNC] getInventoryChangesSince error:', err)
    throw err
  }
}

/**
 * Fetch a single inventory row by server id
 */
export const getInventoryById = async (id) => {
  try {
    await ensureNhostReady()
    if (useLocalAuth) return null
    if (!nhostClient) throw new Error('Nhost client not available')

    const query = `
      query GetInventoryById($id: Int!) {
        inventory_by_pk(id: $id) {
          id
          household_id
          product_id
          quantity
          expiry_date
          added_at
          updated_at
          _deleted
          allowGracePeriod
          gracePeriodMonths
          imageUrl
        }
      }
    `

    const call = async () => await nhostClient.graphql.request({ query, variables: { id } })
    const result = await retryRequest(call, { retries: 2, delay: 300 })
    if (result.errors) {
      console.error('[SYNC] getInventoryById graphql errors:', result.errors)
      throw new Error(result.errors[0]?.message || 'Failed to fetch inventory by id')
    }
    return (result.body || result).data?.inventory_by_pk || null
  } catch (err) {
    console.error('[SYNC] getInventoryById error:', err)
    throw err
  }
}

export default nhostClient
