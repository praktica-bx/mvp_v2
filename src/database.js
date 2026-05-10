import { openDB } from 'idb'
import {
  isNhostConfigured,
  isNhostAuthenticated,
  upsertInventoryBatch,
  deleteInventoryBatch,
  getInventoryById,
  getInventoryChangesSince,
  upsertFieldPreferences,
  fetchFieldPreferences,
} from './nhost'

// Re-export nhost helper so consumers can import from `../database`
export { getInventoryById }

const DB_NAME = 'emergency-supply-db'
const DB_VERSION = 8 // v8 adds household_id to inventory and other stores

const DEFAULT_CATEGORIES = [
  { slug: 'food', name: 'Food' },
  { slug: 'water', name: 'Water' },
  { slug: 'meds', name: 'Medications' },
  { slug: 'batteriesPower', name: 'Batteries & Power' },
  { slug: 'heating', name: 'Heating' },
  { slug: 'light', name: 'Light' },
  { slug: 'hygiene', name: 'Hygiene' },
  { slug: 'firstAid', name: 'First Aid' },
  { slug: 'tools', name: 'Tools & Equipment' },
  { slug: 'other', name: 'Other' },
]

export const CATEGORY_DEFAULTS = DEFAULT_CATEGORIES

/**
 * Initialize database with migration support
 * Schema v3 includes sync tracking and enhanced fields
 */
const initDB = async () => {
  try {
    return await openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, newVersion, transaction) {
        console.log(`Upgrading database from v${oldVersion} to v${newVersion}`)

        // Migration from v0 (no database) or v1 to current
        if (oldVersion < 1) {
          // Create products store
          if (!db.objectStoreNames.contains('products')) {
            const productStore = db.createObjectStore('products', {
              keyPath: 'id',
              autoIncrement: true,
            })
            productStore.createIndex('name', 'name', { unique: false })
            productStore.createIndex('normalizedName', 'normalizedName', { unique: false })
            productStore.createIndex('barcode', 'barcode', { unique: false })
          }

          // Create inventory store
          if (!db.objectStoreNames.contains('inventory')) {
            const inventoryStore = db.createObjectStore('inventory', {
              keyPath: 'id',
              autoIncrement: true,
            })
            inventoryStore.createIndex('productId', 'productId', { unique: false })
            inventoryStore.createIndex('expiryDate', 'expiryDate', { unique: false })
            inventoryStore.createIndex('category', 'category', { unique: false })
          }

          // Create settings store
          if (!db.objectStoreNames.contains('settings')) {
            db.createObjectStore('settings', { keyPath: 'key' })
          }
        }

        // Migration from v1 to v2
        if (oldVersion < 2) {
          // Add barcode index if missing
          if (db.objectStoreNames.contains('products')) {
            const productStore = transaction.objectStore('products')
            if (!productStore.indexNames.contains('barcode')) {
              productStore.createIndex('barcode', 'barcode', { unique: false })
            }
          }
        }

        // Migration from v2 to v3 - Add sync tracking
        if (oldVersion < 3) {
          // Create sync_log store for tracking changes
          if (!db.objectStoreNames.contains('sync_log')) {
            const syncStore = db.createObjectStore('sync_log', {
              keyPath: 'id',
              autoIncrement: true,
            })
            syncStore.createIndex('table', 'table', { unique: false })
            syncStore.createIndex('recordId', 'recordId', { unique: false })
            syncStore.createIndex('synced', 'synced', { unique: false })
            syncStore.createIndex('timestamp', 'timestamp', { unique: false })
          }

          // Add sync-related indexes to existing stores
          if (db.objectStoreNames.contains('products')) {
            const productStore = transaction.objectStore('products')
            if (!productStore.indexNames.contains('syncedAt')) {
              productStore.createIndex('syncedAt', 'syncedAt', { unique: false })
            }
            if (!productStore.indexNames.contains('_deleted')) {
              productStore.createIndex('_deleted', '_deleted', { unique: false })
            }
          }

          if (db.objectStoreNames.contains('inventory')) {
            const inventoryStore = transaction.objectStore('inventory')
            if (!inventoryStore.indexNames.contains('syncedAt')) {
              inventoryStore.createIndex('syncedAt', 'syncedAt', { unique: false })
            }
            if (!inventoryStore.indexNames.contains('_deleted')) {
              inventoryStore.createIndex('_deleted', '_deleted', { unique: false })
            }
          }

          if (db.objectStoreNames.contains('settings')) {
            const settingsStore = transaction.objectStore('settings')
            if (!settingsStore.indexNames.contains('syncedAt')) {
              settingsStore.createIndex('syncedAt', 'syncedAt', { unique: false })
            }
          }

          // Migrate existing data to add new fields
          const productStore = transaction.objectStore('products')
          const inventoryStore = transaction.objectStore('inventory')

          // Add timestamps to existing products
          productStore.openCursor().onsuccess = (event) => {
            const cursor = event.target.result
            if (cursor) {
              const product = cursor.value
              if (!product.createdAt) product.createdAt = new Date().toISOString()
              if (!product.updatedAt) product.updatedAt = product.createdAt
              product.syncedAt = null
              product._deleted = false
              cursor.update(product)
              cursor.continue()
            }
          }

          // Add timestamps to existing inventory items
          inventoryStore.openCursor().onsuccess = (event) => {
            const cursor = event.target.result
            if (cursor) {
              const item = cursor.value
              if (!item.addedAt) item.addedAt = new Date().toISOString()
              item.lastCheckedAt = item.addedAt
              item.notificationSent = false
              item.syncedAt = null
              item._deleted = false
              cursor.update(item)
              cursor.continue()
            }
          }
        }

        // Migration from v3 to v4 - Add catalog stores
        if (oldVersion < 4) {
          // Create products_catalog store for Open Food Facts data
          if (!db.objectStoreNames.contains('products_catalog')) {
            const catalogStore = db.createObjectStore('products_catalog', {
              keyPath: 'id',
              autoIncrement: true,
            })
            catalogStore.createIndex('barcode', 'barcode', { unique: true })
            catalogStore.createIndex('name', 'name', { unique: false })
            catalogStore.createIndex('normalizedName', 'normalizedName', { unique: false })
            catalogStore.createIndex('category', 'category', { unique: false })
            catalogStore.createIndex('brand', 'brand', { unique: false })
            catalogStore.createIndex('source', 'source', { unique: false })
            catalogStore.createIndex('updatedAt', 'updatedAt', { unique: false })
          }

          // Create products_user store for user-customized templates
          if (!db.objectStoreNames.contains('products_user')) {
            const userStore = db.createObjectStore('products_user', {
              keyPath: 'id',
              autoIncrement: true,
            })
            userStore.createIndex('barcode', 'barcode', { unique: false })
            userStore.createIndex('name', 'name', { unique: false })
            userStore.createIndex('normalizedName', 'normalizedName', { unique: false })
            userStore.createIndex('category', 'category', { unique: false })
            userStore.createIndex('usageCount', 'usageCount', { unique: false })
            userStore.createIndex('lastUsedAt', 'lastUsedAt', { unique: false })
          }

          // Create products_index for fast search
          if (!db.objectStoreNames.contains('products_index')) {
            const indexStore = db.createObjectStore('products_index', {
              keyPath: 'id',
              autoIncrement: true,
            })
            indexStore.createIndex('searchKey', 'searchKey', { unique: false })
            indexStore.createIndex('productId', 'productId', { unique: false })
            indexStore.createIndex('sourceTable', 'sourceTable', { unique: false })
            indexStore.createIndex('score', 'score', { unique: false })
          }

          // Create catalog_metadata for version tracking
          if (!db.objectStoreNames.contains('catalog_metadata')) {
            db.createObjectStore('catalog_metadata', { keyPath: 'key' })
          }
        }

        // Migration from v4 to v5 - Add consumption tracking and shopping list
        if (oldVersion < 5) {
          // Create consumption_log store
          if (!db.objectStoreNames.contains('consumption_log')) {
            const consumptionStore = db.createObjectStore('consumption_log', {
              keyPath: 'id',
            })
            consumptionStore.createIndex('inventory_id', 'inventory_id', { unique: false })
            consumptionStore.createIndex('product_id', 'product_id', { unique: false })
            consumptionStore.createIndex('consumed_at', 'consumed_at', { unique: false })
            consumptionStore.createIndex('category', 'category', { unique: false })
          }

          // Create shopping_list store
          if (!db.objectStoreNames.contains('shopping_list')) {
            const shoppingStore = db.createObjectStore('shopping_list', {
              keyPath: 'id',
            })
            shoppingStore.createIndex('product_id', 'product_id', { unique: false })
            shoppingStore.createIndex('category', 'category', { unique: false })
            shoppingStore.createIndex('priority', 'priority', { unique: false })
            shoppingStore.createIndex('purchased', 'purchased', { unique: false })
            shoppingStore.createIndex('created_at', 'created_at', { unique: false })
          }

          // Create achievements store
          if (!db.objectStoreNames.contains('achievements')) {
            const achievementStore = db.createObjectStore('achievements', {
              keyPath: 'id',
            })
            achievementStore.createIndex('unlocked_at', 'unlocked_at', { unique: false })
            achievementStore.createIndex('type', 'type', { unique: false })
          }
        }

        // Migration from v5 to v6 - Add alerts settings store
        if (oldVersion < 6) {
          if (!db.objectStoreNames.contains('alerts_settings')) {
            const alertsStore = db.createObjectStore('alerts_settings', { keyPath: 'id' })
            alertsStore.createIndex('enabled', 'enabled', { unique: false })
            alertsStore.createIndex('channel', 'channel', { unique: false })
          }
        }

        // Migration from v6 to v7 - Categories store
        if (oldVersion < 7) {
          if (!db.objectStoreNames.contains('categories')) {
            const categoriesStore = db.createObjectStore('categories', {
              keyPath: 'id',
              autoIncrement: true,
            })
            categoriesStore.createIndex('slug', 'slug', { unique: true })
            categoriesStore.createIndex('normalizedName', 'normalizedName', { unique: true })
            categoriesStore.createIndex('archived', 'archived', { unique: false })

            DEFAULT_CATEGORIES.forEach((cat) => {
              categoriesStore.add({
                ...cat,
                normalizedName: normalizeText(cat.name),
                archived: false,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              })
            })
          }
        }

        // Migration from v7 to v8 - Add household_id support
        if (oldVersion < 8) {
          // Add household_id index to inventory store
          if (db.objectStoreNames.contains('inventory')) {
            const inventoryStore = transaction.objectStore('inventory')
            if (!inventoryStore.indexNames.contains('household_id')) {
              inventoryStore.createIndex('household_id', 'household_id', { unique: false })
            }
          }

          // Add household_id index to products_user store
          if (db.objectStoreNames.contains('products_user')) {
            const userStore = transaction.objectStore('products_user')
            if (!userStore.indexNames.contains('household_id')) {
              userStore.createIndex('household_id', 'household_id', { unique: false })
            }
          }

          // Add household_id index to consumption_log
          if (db.objectStoreNames.contains('consumption_log')) {
            const consumptionStore = transaction.objectStore('consumption_log')
            if (!consumptionStore.indexNames.contains('household_id')) {
              consumptionStore.createIndex('household_id', 'household_id', { unique: false })
            }
          }

          // Add household_id index to shopping_list
          if (db.objectStoreNames.contains('shopping_list')) {
            const shoppingStore = transaction.objectStore('shopping_list')
            if (!shoppingStore.indexNames.contains('household_id')) {
              shoppingStore.createIndex('household_id', 'household_id', { unique: false })
            }
          }

          // Create household_settings store for per-household configuration
          if (!db.objectStoreNames.contains('household_settings')) {
            const settingsStore = db.createObjectStore('household_settings', {
              keyPath: 'id',
              autoIncrement: true,
            })
            settingsStore.createIndex('household_id', 'household_id', { unique: true })
            settingsStore.createIndex('key', 'key', { unique: false })
          }
        }
      },
    })
  } catch (error) {
    console.error('Failed to initialize database:', error)
    throw new Error(`Database initialization failed: ${error.message}`)
  }
}

 
// Normalize text for matching (remove special chars, lowercase, trim)
const normalizeText = (text) => {
  if (!text) return ''
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
}

const canonicalCategorySlug = (name) => {
  const normalized = normalizeText(name)
  if (!normalized) return 'other'

  const lookup = {
    food: 'food',
    water: 'water',
    meds: 'meds',
    medications: 'meds',
    medicine: 'meds',
    'batteries power': 'batteriesPower',
    batteries: 'batteriesPower',
    power: 'batteriesPower',
    heating: 'heating',
    heat: 'heating',
    light: 'light',
    hygiene: 'hygiene',
    'first aid': 'firstAid',
    tools: 'tools',
    equipment: 'tools',
    'tools equipment': 'tools',
    other: 'other',
  }

  if (lookup[normalized]) return lookup[normalized]

  // Fallback slug: kebab-case normalized text
  return normalized.replace(/\s+/g, '-').slice(0, 64)
}

const sanitizeCategoryName = (name) => {
  if (!name) return 'Other'
  return name.trim().replace(/\s+/g, ' ').slice(0, 80)
}

/**
 * Track a change for sync
 * Logs operations (create, update, delete) to sync_log
 *
 * @param {string} table - Table name (products, inventory, settings)
 * @param {number|string} recordId - Record ID
 * @param {string} operation - Operation type (create, update, delete)
 */
export const trackChange = async (table, recordId, operation) => {
  try {
    const db = await initDB()
    const tx = db.transaction('sync_log', 'readwrite')
    await tx.store.add({
      table,
      recordId,
      operation,
      timestamp: new Date().toISOString(),
      synced: false,
    })
    await tx.done
    console.log(`[SYNC] trackChange: logged ${operation} on ${table}/${recordId}`)
  } catch (error) {
    console.error('Failed to track change:', error)
    // Don't throw - tracking failure shouldn't break the operation
  }
}

/**
 * Get pending changes that need to be synced
 * Includes the actual data for each changed record
 *
 * @returns {Array} Array of unsynced changes with data
 */
export const getPendingChanges = async () => {
  try {
    const db = await initDB()
    // Read all sync logs in one shot (no tx reuse across await)
    const allLogs = await db.getAll('sync_log')
    const logs = allLogs.filter((log) => log && log.synced === false)

    // Fetch actual data for each log using independent db.get() calls
    // (each call opens and closes its own readonly transaction, avoiding the
    //  "transaction already committed" IDB error that arises from reusing a
    //  transaction across separate await boundaries)
    const validStores = ['products', 'inventory', 'settings', 'sync_log']
    const changes = []
    for (const log of logs) {
      let data = null
      if (log.operation !== 'delete' && validStores.includes(log.table)) {
        try {
          data = await db.get(log.table, log.recordId)
        } catch (e) {
          console.warn(`[SYNC] Failed to get ${log.table}/${log.recordId}:`, e.message || e)
        }
      }
      changes.push({ ...log, data })
    }
    return changes
  } catch (error) {
    console.error('Failed to get pending changes:', error)
    throw new Error(`Failed to retrieve pending changes: ${error.message}`)
  }
}

/**
 * Mark a change as synced
 *
 * @param {string} table - Table name
 * @param {number|string} recordId - Record ID
 */
export const markSynced = async (table, recordId) => {
  try {
    const db = await initDB()
    const tx = db.transaction('sync_log', 'readwrite')
    const index = tx.store.index('recordId')
    let cursor = await index.openCursor(recordId)

    while (cursor) {
      if (cursor.value.table === table && !cursor.value.synced) {
        const record = cursor.value
        record.synced = true
        record.syncedAt = new Date().toISOString()
        await cursor.update(record)
      }
      cursor = await cursor.continue()
    }

    await tx.done

    // Also update the record's syncedAt timestamp
    const recordTx = db.transaction(table, 'readwrite')
    const recordStore = recordTx.objectStore(table)
    const record = await recordStore.get(recordId)
    if (record) {
      record.syncedAt = new Date().toISOString()
      await recordStore.put(record)
    }
    await recordTx.done
  } catch (error) {
    console.error('Failed to mark change as synced:', error)
    throw new Error(`Failed to mark change as synced: ${error.message}`)
  }
}

/**
 * Clear old synced logs (housekeeping)
 * Removes synced logs older than specified days
 *
 * @param {number} daysToKeep - Number of days to keep synced logs (default: 30)
 */
export const clearOldSyncLogs = async (daysToKeep = 30) => {
  try {
    const db = await initDB()
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep)
    const cutoffISO = cutoffDate.toISOString()

    const tx = db.transaction('sync_log', 'readwrite')
    const index = tx.store.index('synced')
    let cursor = await index.openCursor(true) // Only synced items

    let deleted = 0
    while (cursor) {
      if (cursor.value.syncedAt && cursor.value.syncedAt < cutoffISO) {
        await cursor.delete()
        deleted++
      }
      cursor = await cursor.continue()
    }

    await tx.done
    console.log(`Cleared ${deleted} old sync logs`)
    return deleted
  } catch (error) {
    console.error('Failed to clear old sync logs:', error)
  }
}

// ============================================================================
// CATEGORY OPERATIONS
// ============================================================================

const ensureCategoriesStore = async () => {
  try {
    const db = await initDB()
    if (!db.objectStoreNames.contains('categories')) {
      console.warn('Categories store missing; returning defaults')
      return null
    }
    return db
  } catch (error) {
    console.error('Failed to ensure categories store:', error)
    return null
  }
}

export const getCategories = async ({ includeArchived = false } = {}) => {
  try {
    const db = await ensureCategoriesStore()
    if (!db) return DEFAULT_CATEGORIES

    const tx = db.transaction('categories', 'readonly')
    const items = await tx.store.getAll()
    await tx.done

    const filtered = includeArchived ? items : items.filter((c) => !c.archived)
    if (!filtered.length) {
      // Seed defaults if empty
      const now = new Date().toISOString()
      const seedTx = db.transaction('categories', 'readwrite')
      for (const cat of DEFAULT_CATEGORIES) {
        await seedTx.store.add({
          ...cat,
          normalizedName: normalizeText(cat.name),
          archived: false,
          createdAt: now,
          updatedAt: now,
        })
      }
      await seedTx.done
      return DEFAULT_CATEGORIES
    }

    return filtered
  } catch (error) {
    console.error('Failed to load categories:', error)
    return DEFAULT_CATEGORIES
  }
}

export const upsertCategory = async (input) => {
  const name = sanitizeCategoryName(typeof input === 'string' ? input : input?.name)
  const slugFromInput = typeof input === 'object' && input?.slug ? input.slug : null
  const slug = slugFromInput || canonicalCategorySlug(name)
  const normalizedName = normalizeText(name)

  try {
    const db = await ensureCategoriesStore()
    if (!db) {
      const fallback = DEFAULT_CATEGORIES.find((c) => c.slug === slug)
      return fallback || { id: null, slug, name }
    }

    const tx = db.transaction('categories', 'readwrite')
    const normalizedIndex = tx.store.index('normalizedName')
    const existing = await normalizedIndex.get(normalizedName)

    const now = new Date().toISOString()
    if (existing) {
      const updated = {
        ...existing,
        name,
        slug,
        normalizedName,
        archived: false,
        updatedAt: now,
      }
      await tx.store.put(updated)
      await tx.done
      return updated
    }

    const id = await tx.store.add({
      name,
      slug,
      normalizedName,
      archived: false,
      createdAt: now,
      updatedAt: now,
    })
    await tx.done

    return { id, name, slug, normalizedName, archived: false, createdAt: now, updatedAt: now }
  } catch (error) {
    console.error('Failed to upsert category:', error)
    return { id: null, name, slug }
  }
}

const updateCategorySlugInStore = async (db, storeName, sourceSlug, targetSlug) => {
  if (!db.objectStoreNames.contains(storeName)) return

  const tx = db.transaction(storeName, 'readwrite')
  let cursor = await tx.store.openCursor()
  while (cursor) {
    const value = cursor.value
    if (value.category === sourceSlug) {
      value.category = targetSlug
      await cursor.update(value)
    }
    cursor = await cursor.continue()
  }
  await tx.done
}

export const mergeCategories = async (targetSlug, sourceSlugs = []) => {
  const uniqueSources = [...new Set(sourceSlugs)].filter((s) => s && s !== targetSlug)
  if (!targetSlug || uniqueSources.length === 0) return { updated: 0 }

  try {
    const db = await ensureCategoriesStore()
    if (!db) return { updated: 0 }

    const tx = db.transaction('categories', 'readwrite')
    const slugIndex = tx.store.index('slug')
    const target = await slugIndex.get(targetSlug)

    if (!target) {
      await tx.done
      throw new Error(`Target category ${targetSlug} not found`)
    }

    await tx.done

    const storesToUpdate = [
      'products',
      'inventory',
      'shopping_list',
      'consumption_log',
      'products_user',
      'products_catalog',
    ]

    let updates = 0
    for (const sourceSlug of uniqueSources) {
      for (const store of storesToUpdate) {
        await updateCategorySlugInStore(db, store, sourceSlug, targetSlug)
      }

      const archiveTx = db.transaction('categories', 'readwrite')
      const idx = archiveTx.store.index('slug')
      const sourceRecord = await idx.get(sourceSlug)
      if (sourceRecord) {
        sourceRecord.archived = true
        sourceRecord.updatedAt = new Date().toISOString()
        await archiveTx.store.put(sourceRecord)
        updates++
      }
      await archiveTx.done
    }

    return { updated: updates }
  } catch (error) {
    console.error('Failed to merge categories:', error)
    return { updated: 0, error: error.message }
  }
}

export const getCategoryUsageCounts = async () => {
  const counts = {}
  try {
    const db = await initDB()
    const addCount = (slug) => {
      if (!slug) return
      counts[slug] = counts[slug] ? counts[slug] + 1 : 1
    }

    const inventory = await db.getAll('inventory')
    inventory.forEach((item) => addCount(item.category))

    const products = await db.getAll('products')
    products.forEach((p) => addCount(p.category))

    if (db.objectStoreNames.contains('shopping_list')) {
      const shopping = await db.getAll('shopping_list')
      shopping.forEach((item) => addCount(item.category))
    }

    return counts
  } catch (error) {
    console.error('Failed to compute category usage counts:', error)
    return counts
  }
}

// ============================================================================
// PRODUCT OPERATIONS
// ============================================================================

/**
 * Add a new product
 * @param {Object} product - Product data
 * @returns {number} Product ID
 */
export const addProduct = async (product) => {
  try {
    const db = await initDB()
    const normalizedName = normalizeText(product.name)
    const now = new Date().toISOString()

    const productData = {
      ...product,
      normalizedName,
      createdAt: now,
      updatedAt: now,
      syncedAt: null,
      _deleted: false,
    }

    const tx = db.transaction('products', 'readwrite')
    const id = await tx.store.add(productData)
    await tx.done

    // Track change for sync
    await trackChange('products', id, 'create')

    return id
  } catch (error) {
    console.error('Failed to add product:', error)
    throw new Error(`Failed to add product: ${error.message}`)
  }
}

/**
 * Get all products (excluding deleted)
 * @param {boolean} includeDeleted - Include soft-deleted products
 * @returns {Array} Array of products
 */
export const getProducts = async (includeDeleted = false) => {
  try {
    const db = await initDB()
    const products = await db.getAll('products')

    if (includeDeleted) {
      return products
    }

    return products.filter((p) => !p._deleted)
  } catch (error) {
    console.error('Failed to get products:', error)
    throw new Error(`Failed to retrieve products: ${error.message}`)
  }
}

/**
 * Get product by ID
 * @param {number} id - Product ID
 * @returns {Object|null} Product or null if not found
 */
export const getProductById = async (id) => {
  try {
    const db = await initDB()
    const product = await db.get('products', id)
    return product && !product._deleted ? product : null
  } catch (error) {
    console.error('Failed to get product:', error)
    throw new Error(`Failed to retrieve product: ${error.message}`)
  }
}

/**
 * Get product by barcode
 * @param {string} barcode - Product barcode
 * @returns {Object|null} Product or null if not found
 */
export const getProductByBarcode = async (barcode) => {
  try {
    const db = await initDB()
    const tx = db.transaction('products', 'readonly')
    const index = tx.store.index('barcode')
    const product = await index.get(barcode)
    await tx.done
    return product && !product._deleted ? product : null
  } catch (error) {
    console.error('Failed to get product by barcode:', error)
    return null
  }
}

/**
 * Find product by name (fuzzy matching)
 * @param {string} scannedText - Text to search for
 * @returns {Object|null} Matching product or null
 */
export const findProductByName = async (scannedText) => {
  try {
    const db = await initDB()
    const normalized = normalizeText(scannedText)
    const products = await db.getAll('products')

    // Find exact or partial match (excluding deleted)
    return products.find((p) => {
      if (p._deleted) return false
      const productNormalized = p.normalizedName
      return productNormalized.includes(normalized) || normalized.includes(productNormalized)
    })
  } catch (error) {
    console.error('Failed to find product:', error)
    return null
  }
}

/**
 * Update product
 * @param {number} id - Product ID
 * @param {Object} updates - Fields to update
 */
export const updateProduct = async (id, updates) => {
  try {
    const db = await initDB()
    // Read in its own transaction first (avoid reusing a readwrite tx across await)
    const product = await db.get('products', id)
    if (!product) {
      throw new Error(`Product with ID ${id} not found`)
    }
    const updatedProduct = {
      ...product,
      ...updates,
      updatedAt: new Date().toISOString(),
      syncedAt: null,
    }
    if (updates.name && updates.name !== product.name) {
      updatedProduct.normalizedName = normalizeText(updates.name)
    }
    // Write in a fresh transaction
    const tx = db.transaction('products', 'readwrite')
    await tx.store.put(updatedProduct)
    await tx.done
    await trackChange('products', id, 'update')
  } catch (error) {
    console.error('Failed to update product:', error)
    throw new Error(`Failed to update product: ${error.message}`)
  }
}

/**
 * Delete product (soft delete)
 * @param {number} id - Product ID
 * @param {boolean} hard - Permanently delete (default: false)
 */
export const deleteProduct = async (id, hard = false) => {
  try {
    const db = await initDB()
    if (hard) {
      const tx = db.transaction('products', 'readwrite')
      await tx.store.delete(id)
      await tx.done
    } else {
      // Read first, then write in a separate transaction (avoid tx reuse across await)
      const product = await db.get('products', id)
      if (product) {
        const tx = db.transaction('products', 'readwrite')
        await tx.store.put({
          ...product,
          _deleted: true,
          updatedAt: new Date().toISOString(),
          syncedAt: null,
        })
        await tx.done
      }
    }
    await trackChange('products', id, 'delete')
  } catch (error) {
    console.error('Failed to delete product:', error)
    throw new Error(`Failed to delete product: ${error.message}`)
  }
}

/**
 * Upsert product (insert or update)
 * Used by sync engine to merge remote data
 * @param {Object} product - Product data with id
 */
export const upsertProduct = async (product) => {
  try {
    const db = await initDB()
    // All reads must complete before opening the write transaction
    // (reusing a readwrite tx across await boundaries causes auto-commit errors)
    let existing = null
    try {
      if (product.barcode) {
        existing = await db.getFromIndex('products', 'barcode', product.barcode)
      }
    } catch (_err) {
      existing = null
    }
    if (!existing && product.id) {
      existing = await db.get('products', product.id)
    }

    let productData
    if (existing) {
      const existingTime = new Date(existing.updated_at || existing.updatedAt || 0)
      const remoteTime = new Date(product.updated_at || product.updatedAt || 0)
      productData =
        remoteTime >= existingTime ? { ...existing, ...product } : { ...product, ...existing }
      if (existing.id !== undefined) productData.id = existing.id
    } else {
      productData = { ...product }
    }
    if (productData.name && !productData.normalizedName) {
      productData.normalizedName = normalizeText(productData.name)
    }
    // Now open a fresh write transaction
    const tx = db.transaction('products', 'readwrite')
    await tx.store.put(productData)
    await tx.done
    return productData.id
  } catch (error) {
    console.error('Failed to upsert product:', error)
    throw new Error(`Failed to upsert product: ${error.message}`)
  }
}

// ============================================================================
// INVENTORY OPERATIONS
// ============================================================================

/**
 * Add inventory item
 * @param {Object} item - Inventory item data
 * @returns {number} Inventory ID
 */
export const addInventoryItem = async (item, householdId) => {
  try {
    // Allow callers to pass household via second arg, or via item.household_id,
    // or fall back to localStorage.currentHouseholdId for convenience in the UI.
    householdId = householdId || item?.household_id || (typeof localStorage !== 'undefined' && localStorage.getItem('currentHouseholdId'))

    if (!householdId) {
      throw new Error('Household ID is required to add inventory items')
    }

    const db = await initDB()
    const now = new Date().toISOString()

    const itemData = {
      id: item.id || crypto.randomUUID(),  // UUID so local and server IDs match
      ...item,
      household_id: householdId,
      addedAt: now,
      lastCheckedAt: now,
      notificationSent: false,
      syncedAt: null,
      _deleted: false,
    }

    const tx = db.transaction('inventory', 'readwrite')
    const id = await tx.store.put(itemData)  // put preserves the pre-set UUID
    await tx.done

    // Track change for sync
    await trackChange('inventory', id, 'create')

    // Trigger immediate background sync (best-effort)
    try {
      syncToCloud().catch((e) => console.warn('[SYNC] Background sync after add failed:', e.message || e))
    } catch (e) {
      console.warn('[SYNC] Failed to trigger background sync:', e.message || e)
    }

    return id
  } catch (error) {
    console.error('Failed to add inventory item:', error)
    throw new Error(`Failed to add inventory item: ${error.message}`)
  }
}

/**
 * Get all inventory items for a household (excluding deleted)
 * @param {string} householdId - Household ID
 * @param {boolean} includeDeleted - Include soft-deleted items
 * @returns {Array} Array of inventory items
 */
export const getInventory = async (householdId, includeDeleted = false) => {
  try {
    if (!householdId) {
      throw new Error('Household ID is required to retrieve inventory')
    }

    const db = await initDB()
    const items = await db.getAllFromIndex('inventory', 'household_id', householdId)

    if (includeDeleted) {
      return items
    }

    return items.filter((item) => !item._deleted)
  } catch (error) {
    console.error('Failed to get inventory:', error)
    throw new Error(`Failed to retrieve inventory: ${error.message}`)
  }
}

/**
 * Get inventory items by product ID
 * @param {number} productId - Product ID
 * @returns {Array} Array of inventory items
 */
export const getInventoryByProduct = async (productId) => {
  try {
    const db = await initDB()
    const items = await db.getAllFromIndex('inventory', 'productId', productId)
    return items.filter((item) => !item._deleted)
  } catch (error) {
    console.error('Failed to get inventory by product:', error)
    throw new Error(`Failed to retrieve inventory: ${error.message}`)
  }
}

/**
 * Get enriched inventory items (inventory + product data) for a household
 * Merges inventory items with their corresponding product templates
 * to include images and other product metadata
 * @param {string} householdId - Household ID
 * @param {boolean} includeDeleted - Include soft-deleted items
 * @returns {Array} Array of enriched inventory items
 */
export const getEnrichedInventory = async (householdId, includeDeleted = false) => {
  try {
    if (!householdId) {
      throw new Error('Household ID is required to retrieve inventory')
    }

    const db = await initDB()

    // Get all inventory items for household
    const inventoryItems = await db.getAllFromIndex('inventory', 'household_id', householdId)
    const filteredInventory = includeDeleted
      ? inventoryItems
      : inventoryItems.filter((item) => !item._deleted)

    // Get all products for lookup
    const products = await db.getAll('products')
    const productMap = new Map(products.map((p) => [p.id, p]))

    // Enrich inventory items with product data
    return filteredInventory.map((item) => {
      const product = item.productId ? productMap.get(item.productId) : null

      return {
        ...item,
        // Enrich with product data if available
        imageUrl: product?.imageUrl || item.imageUrl || null,
        imageBlob: product?.imageBlob || item.imageBlob || null,
        brand: product?.brand || item.brand || null,
        barcode: product?.barcode || item.barcode || null,
        allergens: product?.allergens || item.allergens || null,
        nutrition: product?.nutrition || item.nutrition || null,
        ingredients: product?.ingredients || item.ingredients || null,
        // Keep original inventory data as primary
        productTemplate: product || null,
      }
    })
  } catch (error) {
    console.error('Failed to get enriched inventory:', error)
    throw new Error(`Failed to retrieve enriched inventory: ${error.message}`)
  }
}

/**
 * Update inventory item
 * @param {number} id - Inventory ID
 * @param {Object} updates - Fields to update
 */
export const updateInventoryItem = async (id, updates) => {
  try {
    const db = await initDB();
    // Step 1: Pre-check for conflicts (separate transaction)
    let item = null;
    if (isNhostConfigured() && isNhostAuthenticated()) {
      try {
        const txCheck = db.transaction('inventory', 'readonly');
        item = await txCheck.store.get(id);
        await txCheck.done;
        if (!item) throw new Error(`Inventory item with ID ${id} not found`);
        const remote = await getInventoryById(id);
        if (remote && remote.updated_at && item.syncedAt && new Date(remote.updated_at) > new Date(item.syncedAt)) {
          const err = new Error('Conflict: remote version is newer than local copy');
          err.code = 'conflict';
          throw err;
        }
      } catch (precheckErr) {
        if (precheckErr && precheckErr.code === 'conflict') throw precheckErr;
        console.warn('Pre-write remote check failed; proceeding with local update:', precheckErr.message);
      }
    }
    // If not cloud or precheck failed, get the item locally
    if (!item) {
      const txCheck = db.transaction('inventory', 'readonly');
      item = await txCheck.store.get(id);
      await txCheck.done;
      if (!item) throw new Error(`Inventory item with ID ${id} not found`);
    }
    // Step 2: Update in a fresh transaction
    const tx = db.transaction('inventory', 'readwrite');
    const updatedItem = {
      ...item,
      ...updates,
      lastCheckedAt: new Date().toISOString(),
      syncedAt: null,
    };
    await tx.store.put(updatedItem);
    await tx.done;
    // Step 3: Track change and trigger sync
    await trackChange('inventory', id, 'update');
    try {
      syncToCloud().catch((e) => console.warn('Background sync failed:', e.message || e));
    } catch (e) {
      console.warn('Failed to trigger background sync:', e.message || e);
    }
  } catch (error) {
    console.error('Failed to update inventory item:', error);
    throw new Error(`Failed to update inventory item: ${error.message}`);
  }
};

/**
 * Sync pending local changes to the cloud via GraphQL
 * - Currently handles inventory create/update/delete in batches
 */
export const syncToCloud = async () => {
  try {
    if (!isNhostConfigured()) {
      console.warn('[SYNC] Skipping — Nhost not configured')
      return { success: false, reason: 'Not configured' }
    }
    if (!isNhostAuthenticated()) {
      console.warn('[SYNC] Skipping — not authenticated (session missing or expired)')
      return { success: false, reason: 'Not authenticated' }
    }

    const pending = await getPendingChanges()
    console.log(`[SYNC] syncToCloud: ${pending?.length || 0} pending change(s)`)
    if (!pending || pending.length === 0) return { success: true, synced: 0 }

    // Group inventory changes
    const inventoryUpserts = []
    const inventoryDeletes = []

    for (const change of pending) {
      if (change.table !== 'inventory') continue

      if (change.operation === 'delete') {
        inventoryDeletes.push(change.recordId)
      } else if (change.data) {
        const hid = change.data.household_id
        // Skip items with non-UUID household_id — they were created in offline-local mode
        // and can't be stored in the cloud until a proper household is created
        const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        if (!hid || !UUID_RE.test(hid)) {
          console.warn('[SYNC] Skipping inventory item — household_id is not a UUID:', hid)
          continue
        }
        const obj = {
          id: change.data.id,
          household_id: hid,
          product_name: change.data.productName || change.data.product_name || null,
          product_id: change.data.productId || change.data.product_id || null,
          quantity: change.data.quantity || null,
          unit: change.data.unit || null,
          expiry_date: change.data.expiryDate || change.data.expiry_date || null,
          added_at: change.data.addedAt || change.data.added_at || null,
          updated_at: new Date().toISOString(),
          storage_location: change.data.storageLocation || change.data.storage_location || null,
          _deleted: !!change.data._deleted,
          allowGracePeriod: !!change.data.allowGracePeriod,
          gracePeriodMonths: change.data.gracePeriodMonths || null,
          image_url: change.data.imageUrl || change.data.image_url || null,
        }
        console.log('[SYNC] Queued upsert for item:', obj.id, '| household:', obj.household_id)
        inventoryUpserts.push(obj)
      }
    }

    let syncedCount = 0

    // Send upserts (safe: mark only returned ids as synced)
    if (inventoryUpserts.length > 0) {
      try {
        const res = await upsertInventoryBatch(inventoryUpserts)
        const returnedIds = (res || []).map((r) => r.id).filter(Boolean)
        console.log(`[SYNC] Upsert returned ${returnedIds.length} id(s):`, returnedIds)
        syncedCount += returnedIds.length
        // Mark local logs as synced only for returned ids
        for (const id of returnedIds) {
          try {
            await markSynced('inventory', id)
          } catch (e) {
            console.warn('Failed to mark upserted record as synced:', id, e.message || e)
          }
        }
        // If some requested IDs did not return, log for inspection
        if (returnedIds.length < inventoryUpserts.length) {
          console.warn(`[SYNC] Partial upsert: requested=${inventoryUpserts.length} returned=${returnedIds.length}`)
        }
      } catch (upErr) {
        console.error('[SYNC] upsertInventoryBatch failed, leaving changes unsynced:', upErr)
      }
    }

    // Send deletes
    if (inventoryDeletes.length > 0) {
      try {
        const delRes = await deleteInventoryBatch(inventoryDeletes)
        const affected = delRes?.affected_rows || 0
        // If delete reports affected rows equal to requested, mark as synced
        if (affected > 0) {
          for (const id of inventoryDeletes) {
            try {
              await markSynced('inventory', id)
            } catch (e) {
              console.warn('Failed to mark deleted record as synced:', id, e.message || e)
            }
          }
          syncedCount += affected
        } else {
          console.warn('[SYNC] deleteInventoryBatch reported 0 affected rows')
        }
      } catch (delErr) {
        console.error('[SYNC] deleteInventoryBatch failed, leaving deletes unsynced:', delErr)
      }
    }

    // Update last sync setting (global) only if we synced something
    if (syncedCount > 0) {
      try {
        await setSetting('lastSync', new Date().toISOString())
      } catch (e) {
        console.warn('Failed to update lastSync setting:', e.message || e)
      }
    }

    return { success: true, synced: syncedCount }
  } catch (err) {
    console.error('syncToCloud failed:', err)
    throw err
  }
}

/**
 * Delete inventory item (soft delete)
 * @param {number} id - Inventory ID
 * @param {boolean} hard - Permanently delete (default: false)
 */
export const deleteInventoryItem = async (id, hard = false) => {
  try {
    const db = await initDB()
    const tx = db.transaction('inventory', 'readwrite')

    if (hard) {
      await tx.store.delete(id)
    } else {
      const item = await tx.store.get(id)
      if (item) {
        item._deleted = true
        item.lastCheckedAt = new Date().toISOString()
        item.syncedAt = null
        await tx.store.put(item)
      }
    }

    await tx.done

    // Track change for sync
    await trackChange('inventory', id, 'delete')
  } catch (error) {
    console.error('Failed to delete inventory item:', error)
    throw new Error(`Failed to delete inventory item: ${error.message}`)
  }
}

/**
 * Upsert inventory item (insert or update)
 * Used by sync engine to merge remote data
 * @param {Object} item - Inventory item data with id
 */
export const upsertInventoryItem = async (item) => {
  try {
    const db = await initDB()
    // Read first (auto-transaction via db.get shorthand)
    const existing = await db.get('inventory', item.id)
    let itemData
    if (existing) {
      const existingTime = new Date(
        existing.updated_at || existing.updatedAt || existing.lastCheckedAt || 0,
      )
      const remoteTime = new Date(item.updated_at || item.updatedAt || item.lastCheckedAt || 0)
      itemData = remoteTime >= existingTime ? item : existing
    } else {
      itemData = item
    }
    // Write in a fresh transaction
    const tx = db.transaction('inventory', 'readwrite')
    await tx.store.put(itemData)
    await tx.done
    return itemData.id
  } catch (error) {
    console.error('Failed to upsert inventory item:', error)
    throw new Error(`Failed to upsert inventory item: ${error.message}`)
  }
}

// ============================================================================
// STATISTICS & ANALYTICS
// ============================================================================

/**
 * Get inventory statistics
 * @returns {Object} Stats object with totalItems and expiringSoon
 */
export const getInventoryStats = async (householdId) => {
  try {
    if (!householdId) {
      throw new Error('Household ID is required to get inventory stats')
    }

    const db = await initDB()
    const inventory = await db.getAllFromIndex('inventory', 'household_id', householdId)
    const activeInventory = inventory.filter((item) => !item._deleted)

    const now = new Date()
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

    return {
      totalItems: activeInventory.length,
      expiringSoon: activeInventory.filter((item) => {
        if (!item.expiryDate) return false
        const expiryDate = new Date(item.expiryDate)
        return expiryDate <= thirtyDaysFromNow && expiryDate > now
      }).length,
    }
  } catch (error) {
    console.error('Failed to get inventory stats:', error)
    return { totalItems: 0, expiringSoon: 0 }
  }
}

/**
 * Get inventory items grouped by DSB category for a household
 * @param {string} householdId - Household ID
 * @returns {Object} Object with DSB category keys and item quantities
 */
export const getInventoryByDsbCategory = async (householdId) => {
  try {
    if (!householdId) {
      throw new Error('Household ID is required to get inventory by category')
    }

    const db = await initDB()
    const inventory = await db.getAllFromIndex('inventory', 'household_id', householdId)
    const activeInventory = inventory.filter((item) => !item._deleted)

    // Map supply categories to DSB categories (use dynamic import in ESM/browser)
    const _categoriesMod = await import('./constants/categories')
    const getDsbCategory = _categoriesMod.getDsbCategory ?? (_categoriesMod.default && _categoriesMod.default.getDsbCategory) ?? _categoriesMod.default

    const categoryCounts = {
      water: 0,
      food: 0,
      medications: 0,
      firstAid: 0,
      hygiene: 0,
      warmth: 0,
      light: 0,
      documents: 0,
      tools: 0,
    }

    activeInventory.forEach((item) => {
      const dsbCategory = getDsbCategory(item.category)
      if (dsbCategory && categoryCounts.hasOwnProperty(dsbCategory)) {
        // For most items, count 1 per item. For water/food, use quantity if available
        const quantityToAdd = item.quantity || 1
        if (dsbCategory === 'water' || dsbCategory === 'food') {
          categoryCounts[dsbCategory] += quantityToAdd
        } else {
          categoryCounts[dsbCategory] += 1
        }
      }
    })

    return categoryCounts
  } catch (error) {
    console.error('Failed to get inventory by DSB category:', error)
    return {
      water: 0,
      food: 0,
      medications: 0,
      firstAid: 0,
      hygiene: 0,
      warmth: 0,
      light: 0,
      documents: 0,
      tools: 0,
    }
  }
}

// ============================================================================
// SETTINGS OPERATIONS
// ============================================================================

/**
 * Get setting value
 * @param {string} key - Setting key
 * @returns {*} Setting value or null
 */
export const getSetting = async (key) => {
  try {
    const db = await initDB()
    const setting = await db.get('settings', key)
    return setting ? setting.value : null
  } catch (error) {
    console.error('Failed to get setting:', error)
    return null
  }
}

/**
 * Set setting value
 * @param {string} key - Setting key
 * @param {*} value - Setting value
 */
export const setSetting = async (key, value) => {
  try {
    const db = await initDB()
    const tx = db.transaction('settings', 'readwrite')

    await tx.store.put({
      key,
      value,
      updatedAt: new Date().toISOString(),
      syncedAt: null,
    })

    await tx.done

    // Track change for sync
    await trackChange('settings', key, 'update')
  } catch (error) {
    console.error('Failed to set setting:', error)
    throw new Error(`Failed to save setting: ${error.message}`)
  }
}

/**
 * Field preferences default configuration
 * Defines all available inventory fields and their default visibility/mandatory status
 */
const DEFAULT_FIELD_PREFERENCES = {
  barcode: { visible: true, mandatory: false, label: 'Barcode' },
  productName: { visible: true, mandatory: true, label: 'Product Name' },
  quantity: { visible: true, mandatory: true, label: 'Quantity' },
  unit: { visible: true, mandatory: false, label: 'Unit' },
  expiryDate: { visible: true, mandatory: true, label: 'Expiry Date' },
  category: { visible: true, mandatory: true, label: 'Category' },
  allergens: { visible: true, mandatory: false, label: 'Allergens' },
  storageLocation: { visible: true, mandatory: false, label: 'Storage Location' },
  cost: { visible: false, mandatory: false, label: 'Cost/Price' },
  purchaseDate: { visible: true, mandatory: false, label: 'Purchase Date' },
  preferredConsumptionDate: { visible: false, mandatory: false, label: 'Preferred Consumption Date' },
  supplier: { visible: false, mandatory: false, label: 'Supplier/Source' },
  storageNotes: { visible: false, mandatory: false, label: 'Storage Notes' },
  itemStatus: { visible: false, mandatory: false, label: 'Item Status' },
  lotNumber: { visible: false, mandatory: false, label: 'Lot/Batch Number' },
  nutritionInfo: { visible: false, mandatory: false, label: 'Nutritional Value' },
  dietaryRestrictions: { visible: false, mandatory: false, label: 'Dietary Restrictions' },
  priorityLevel: { visible: false, mandatory: false, label: 'Priority Level' },
  packaging: { visible: false, mandatory: false, label: 'Packaging Details' },
}

/**
 * Get field preferences for the user
 * Returns default preferences if not set
 */
export const getFieldPreferences = async () => {
  try {
    // Try cloud first if online and authenticated
    if (isNhostConfigured() && isNhostAuthenticated()) {
      try {
        const cloudPrefs = await fetchFieldPreferences();
        if (cloudPrefs) {
          // Also update local cache for offline use
          await setSetting('fieldPreferences', cloudPrefs);
          return { ...DEFAULT_FIELD_PREFERENCES, ...cloudPrefs };
        }
      } catch (e) {
        console.warn('Cloud fetchFieldPreferences failed, falling back to local:', e.message || e);
      }
    }
    // Fallback to local IndexedDB
    const prefs = await getSetting('fieldPreferences');
    if (!prefs) return DEFAULT_FIELD_PREFERENCES;
    return { ...DEFAULT_FIELD_PREFERENCES, ...prefs };
  } catch (error) {
    console.error('Failed to get field preferences:', error);
    return DEFAULT_FIELD_PREFERENCES;
  }
}

/**
 * Set field preferences
 * @param {Object} preferences - Field preferences object
 */
export const setFieldPreferences = async (preferences) => {
  try {
    const merged = { ...DEFAULT_FIELD_PREFERENCES, ...preferences };
    // Save to cloud if online and authenticated
    if (isNhostConfigured() && isNhostAuthenticated()) {
      try {
        await upsertFieldPreferences(merged);
      } catch (e) {
        console.warn('Cloud upsertFieldPreferences failed, saving local only:', e.message || e);
      }
    }
    await setSetting('fieldPreferences', merged);
    return merged;
  } catch (error) {
    console.error('Failed to set field preferences:', error);
    throw new Error(`Failed to save field preferences: ${error.message}`);
  }
}

/**
 * Reset field preferences to defaults
 */
export const resetFieldPreferences = async () => {
  try {
    await setSetting('fieldPreferences', DEFAULT_FIELD_PREFERENCES)
    return DEFAULT_FIELD_PREFERENCES
  } catch (error) {
    console.error('Failed to reset field preferences:', error)
    throw new Error(`Failed to reset field preferences: ${error.message}`)
  }
}

/**
 * Get visible and mandatory fields
 * @returns {Object} Object with visibleFields and mandatoryFields arrays
 */
export const getActiveFieldConfig = async () => {
  const prefs = await getFieldPreferences()
  const visibleFields = Object.keys(prefs).filter((key) => prefs[key].visible)
  const mandatoryFields = Object.keys(prefs).filter((key) => prefs[key].mandatory)
  return { visibleFields, mandatoryFields, preferences: prefs }
}

/**
 * Get household size
 * @returns {Object} Household size {adults, children}
 */
export const getHouseholdSize = async () => {
  try {
    const size = await getSetting('householdSize')
    return size || { adults: 1, children: 0 }
  } catch (error) {
    console.error('Failed to get household size:', error)
    return { adults: 1, children: 0 }
  }
}

/**
 * Set household size
 * @param {number} adults - Number of adults
 * @param {number} children - Number of children
 */
export const setHouseholdSize = async (adults, children) => {
  try {
    await setSetting('householdSize', { adults, children })
  } catch (error) {
    console.error('Failed to set household size:', error)
    throw error
  }
}

// ============================================================================
// READINESS CALCULATION
// ============================================================================

/**
 * Calculate emergency readiness based on DSB recommendations
 * @returns {Object} Readiness data {percentage, totalRequired, totalMet, missing}
 * 
 * NOTE: MVP v2 simplified version - basic readiness calculation
 * Full DSB-based implementation available in future versions
 */
export const calculateReadiness = async () => {
  try {
    const inventory = await getInventory()
    // MVP v2 simplified: calculate readiness based on item count and expiry
    const totalItems = inventory.length
    const expiringItems = inventory.filter((item) => {
      if (!item.expiryDate) return false
      const days = Math.ceil((new Date(item.expiryDate) - new Date()) / (1000 * 60 * 60 * 24))
      return days <= 30 && days > 0
    }).length

    // Simple readiness: 100% if have items, lower if expiring soon
    const totalMet = totalItems - expiringItems
    const percentage = totalItems > 0 ? Math.round((totalMet / totalItems) * 100) : 0

    return {
      percentage,
      totalRequired: totalItems,
      totalMet,
      missing: expiringItems,
    }
  } catch (error) {
    console.error('Failed to calculate readiness:', error)
    return {
      percentage: 0,
      totalRequired: 0,
      totalMet: 0,
      missing: 0,
    }
  }
}

// ============================================================================
// NHOST SYNC - Functions exported above as named exports
// ============================================================================

/**
 * Add entry to sync log for offline changes
 * @param {string} operation - 'create', 'update', 'delete'
 * @param {string} tableName - 'inventory' or other table
 * @param {number} recordId - ID of the record
 * @param {Object} changes - The data being synced
 */
export const addSyncLog = async (operation, tableName, recordId, changes) => {
  try {
    const db = await initDB()
    const tx = db.transaction('sync_log', 'readwrite')

    const syncEntry = {
      operation,
      tableName,
      recordId,
      changes,
      status: 'pending',
      createdAt: new Date().toISOString(),
      syncedAt: null,
    }

    const id = await tx.store.add(syncEntry)
    await tx.done

    console.log(`[SYNC LOG] Added ${operation} for ${tableName}:${recordId}`)
    return id
  } catch (error) {
    console.error('Failed to add sync log:', error)
    throw error
  }
}

/**
 * Get sync log entries
 * @param {string} status - Filter by status ('pending', 'synced', 'failed')
 * @returns {Array} Sync log entries
 */
export const getSyncLog = async (status = null) => {
  try {
    const db = await initDB()
    const logs = await db.getAll('sync_log')

    if (status) {
      return logs.filter((log) => log.status === status)
    }

    return logs
  } catch (error) {
    console.error('Failed to get sync log:', error)
    return []
  }
}

/**
 * Get pending syncs
 * @returns {Array} Pending sync entries
 */
export const getPendingSyncs = async () => {
  return getSyncLog('pending')
}

/**
 * Mark sync entry as successful
 * @param {number} syncId - ID of sync log entry
 */
export const markSyncSuccess = async (syncId) => {
  try {
    const db = await initDB()
    const tx = db.transaction('sync_log', 'readwrite')

    const entry = await tx.store.get(syncId)
    if (entry) {
      entry.status = 'synced'
      entry.syncedAt = new Date().toISOString()
      await tx.store.put(entry)
    }

    await tx.done
    console.log(`[SYNC] Marked sync ${syncId} as successful`)
  } catch (error) {
    console.error('Failed to mark sync success:', error)
  }
}

/**
 * Mark sync entry as failed
 * @param {number} syncId - ID of sync log entry
 * @param {string} errorMessage - Error description
 */
export const markSyncFailed = async (syncId, errorMessage) => {
  try {
    const db = await initDB()
    const tx = db.transaction('sync_log', 'readwrite')

    const entry = await tx.store.get(syncId)
    if (entry) {
      entry.status = 'failed'
      entry.errorMessage = errorMessage
      await tx.store.put(entry)
    }

    await tx.done
    console.log(`[SYNC] Marked sync ${syncId} as failed: ${errorMessage}`)
  } catch (error) {
    console.error('Failed to mark sync failed:', error)
  }
}

/**
 * Clear all synced entries from sync log
 */
export const clearSyncLog = async () => {
  try {
    const db = await initDB()
    // Read all logs first (auto-transaction)
    const logs = await db.getAll('sync_log')
    const toDelete = logs.filter((log) => log.status === 'synced').map((log) => log.id).filter(Boolean)
    if (toDelete.length === 0) return
    // Delete in a fresh write transaction
    const tx = db.transaction('sync_log', 'readwrite')
    for (const id of toDelete) {
      tx.store.delete(id)  // queue all deletes synchronously, no await between
    }
    await tx.done
    console.log('[SYNC] Cleared synced entries from sync log')
  } catch (error) {
    console.error('Failed to clear sync log:', error)
  }
}

/**
 * Convert local data format to Nhost format
 * @param {Object} item - Local inventory item
 * @returns {Object} Nhost-formatted item
 */
function convertToNhostFormat(item) {
  const nhostItem = {
    barcode: item.barcode || null,
    product_name: item.productName,
    quantity: item.quantity,
    unit: item.unit,
    expiry_date: item.expiryDate,
    purchase_date: item.purchaseDate || null,
    preferred_consumption_date: item.preferredConsumptionDate || null,
    storage_location: item.storageLocation || null,
    item_status: item.itemStatus || 'unopened',
    storage_notes: item.storageNotes || null,
    allergens: item.allergens || null,
    dietary_restrictions: item.dietaryRestrictions || [],
    cost: item.cost ? parseFloat(item.cost) : null,
    supplier: item.supplier || null,
    lot_number: item.lotNumber || null,
    nutrition_info: item.nutritionInfo || null,
    priority_level: item.priorityLevel || 'important',
    packaging: item.packaging || null,
  }

  return nhostItem
}

/**
 * Sync offline inventory items to Nhost
 * @param {Object} nhostClient - Nhost client instance
 * @returns {Object} Sync results
 */
export const syncToNhost = async (nhostClient) => {
  if (!nhostClient || !nhostClient.graphql.request) {
    console.warn('[SYNC] Nhost client not available, skipping sync')
    return { success: false, synced: 0, failed: 0, message: 'Nhost not configured' }
  }

  try {
    const pendingSyncs = await getPendingSyncs()

    if (pendingSyncs.length === 0) {
      console.log('[SYNC] No pending syncs')
      return { success: true, synced: 0, failed: 0, message: 'No pending items' }
    }

    console.log(`[SYNC] Starting sync of ${pendingSyncs.length} items`)

    let synced = 0
    let failed = 0

    for (const syncEntry of pendingSyncs) {
      try {
        const { operation, tableName, recordId, changes } = syncEntry

        if (tableName !== 'inventory') {
          await markSyncSuccess(syncEntry.createdAt)
          synced++
          continue
        }

        // Build GraphQL mutation for inventory
        let mutation
        let variables = { data: convertToNhostFormat(changes) }

        if (operation === 'create') {
          mutation = `
            mutation CreateInventoryItem($data: inventory_insert_input!) {
              insert_inventory_one(object: $data) {
                id
              }
            }
          `
        } else if (operation === 'update') {
          mutation = `
            mutation UpdateInventoryItem($id: uuid!, $data: inventory_set_input!) {
              update_inventory_by_pk(pk_columns: { id: $id }, _set: $data) {
                id
              }
            }
          `
          variables.id = recordId
        } else if (operation === 'delete') {
          mutation = `
            mutation DeleteInventoryItem($id: uuid!) {
              delete_inventory_by_pk(id: $id) {
                id
              }
            }
          `
          variables.id = recordId
        }

        if (!mutation) {
          await markSyncFailed(syncEntry.createdAt, 'Unknown operation')
          failed++
          continue
        }

        // Execute mutation
        await nhostClient.graphql.request({
          query: mutation,
          variables,
        })

        await markSyncSuccess(syncEntry.createdAt)
        synced++
      } catch (itemError) {
        console.error(`[SYNC] Failed to sync item:`, itemError)
        await markSyncFailed(syncEntry.createdAt, itemError.message)
        failed++
      }
    }

    console.log(`[SYNC] Completed: ${synced} synced, ${failed} failed`)

    return {
      success: failed === 0,
      synced,
      failed,
      message: `Synced ${synced} items${failed > 0 ? `, ${failed} failed` : ''}`,
    }
  } catch (error) {
    console.error('[SYNC] Sync failed:', error)
    return { success: false, synced: 0, failed: 0, message: error.message }
  }
}

/**
 * Fetch changes from cloud and apply to local DB for a household
 * - Uses server `updated_at` as authoritative timestamp
 */
export const fetchFromCloud = async (householdId) => {
  try {
    if (!householdId) throw new Error('householdId required')
    if (!isNhostConfigured() || !isNhostAuthenticated()) {
      return { success: false, reason: 'Not configured or not authenticated' }
    }

    // Last sync per-household
    const lastSyncKey = `lastSync:${householdId}`
    const lastSync = (await getSetting(lastSyncKey)) || new Date(0).toISOString()

    const changes = await getInventoryChangesSince(lastSync, householdId)
    if (!changes || changes.length === 0) {
      await setSetting(lastSyncKey, new Date().toISOString())
      return { success: true, applied: 0 }
    }

    const db = await initDB()
    const tx = db.transaction('inventory', 'readwrite')
    let applied = 0

    for (const row of changes) {
      const existing = await tx.store.get(row.id)

      if (row._deleted) {
        if (existing) {
          existing._deleted = true
          existing.syncedAt = row.updated_at || new Date().toISOString()
          await tx.store.put(existing)
        } else {
          // create tombstone
          await tx.store.put({
            id: row.id,
            household_id: row.household_id,
            _deleted: true,
            syncedAt: row.updated_at || new Date().toISOString(),
          })
        }
        applied++
        continue
      }

      const toPut = {
        id: row.id,
        household_id: row.household_id,
        productId: row.product_id || null,
        productName: row.product_name || null,
        quantity: row.quantity || null,
        unit: row.unit || null,
        expiryDate: row.expiry_date || null,
        storageLocation: row.storage_location || null,
        addedAt: row.added_at || new Date().toISOString(),
        lastCheckedAt: row.updated_at || new Date().toISOString(),
        notificationSent: false,
        syncedAt: row.updated_at || new Date().toISOString(),
        _deleted: !!row._deleted,
        allowGracePeriod: !!row.allowGracePeriod,
        gracePeriodMonths: row.gracePeriodMonths || null,
        image_url: row.image_url || null,
        imageUrl: row.image_url || row.imageUrl || null,
      }

      await tx.store.put({ ...existing, ...toPut })
      applied++
    }

    await tx.done

    // Update lastSync marker
    await setSetting(lastSyncKey, new Date().toISOString())

    return { success: true, applied }
  } catch (err) {
    console.error('fetchFromCloud failed:', err)
    throw err
  }
}

/**
 * Force update inventory item without pre-write remote check.
 * Use this when the user explicitly chooses to overwrite remote data.
 */
export const updateInventoryItemForce = async (id, updates) => {
  try {
    const db = await initDB()
    // Read with auto-transaction shorthand, then write in a fresh transaction
    const item = await db.get('inventory', id)
    if (!item) {
      throw new Error(`Inventory item with ID ${id} not found`)
    }
    const updatedItem = {
      ...item,
      ...updates,
      lastCheckedAt: new Date().toISOString(),
      syncedAt: null,
    }
    const tx = db.transaction('inventory', 'readwrite')
    await tx.store.put(updatedItem)
    await tx.done

    // Track change for sync
    await trackChange('inventory', id, 'update')

    // Trigger background sync (best-effort)
    try {
      syncToCloud().catch((e) => console.warn('Background sync failed:', e.message || e))
    } catch (e) {
      console.warn('Failed to trigger background sync:', e.message || e)
    }
  } catch (error) {
    console.error('Failed to force update inventory item:', error)
    throw new Error(`Failed to update inventory item: ${error.message}`)
  }
}

/**
 * Get a single inventory item by id from local DB
 */
export const getInventoryItem = async (id) => {
  try {
    const db = await initDB()
    const item = await db.get('inventory', id)
    return item || null
  } catch (err) {
    console.error('Failed to get inventory item:', err)
    throw err
  }
}