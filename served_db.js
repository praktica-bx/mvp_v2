import { openDB } from "/node_modules/.vite/deps/idb.js?v=263122e5";
import { isNhostConfigured, isNhostAuthenticated, upsertInventoryBatch, deleteInventoryBatch, getInventoryById, getInventoryChangesSince } from "/src/nhost.js?t=1769373338868";
// Re-export nhost helper so consumers can import from `../database`
export { getInventoryById };
const DB_NAME = "emergency-supply-db";
const DB_VERSION = 8;
const DEFAULT_CATEGORIES = [
	{
		slug: "food",
		name: "Food"
	},
	{
		slug: "water",
		name: "Water"
	},
	{
		slug: "meds",
		name: "Medications"
	},
	{
		slug: "batteriesPower",
		name: "Batteries & Power"
	},
	{
		slug: "heating",
		name: "Heating"
	},
	{
		slug: "light",
		name: "Light"
	},
	{
		slug: "hygiene",
		name: "Hygiene"
	},
	{
		slug: "firstAid",
		name: "First Aid"
	},
	{
		slug: "tools",
		name: "Tools & Equipment"
	},
	{
		slug: "other",
		name: "Other"
	}
];
export const CATEGORY_DEFAULTS = DEFAULT_CATEGORIES;
/**
* Initialize database with migration support
* Schema v3 includes sync tracking and enhanced fields
*/
const initDB = async () => {
	try {
		return await openDB(DB_NAME, DB_VERSION, { upgrade(db, oldVersion, newVersion, transaction) {
			console.log(`Upgrading database from v${oldVersion} to v${newVersion}`);
			// Migration from v0 (no database) or v1 to current
			if (oldVersion < 1) {
				// Create products store
				if (!db.objectStoreNames.contains("products")) {
					const productStore = db.createObjectStore("products", {
						keyPath: "id",
						autoIncrement: true
					});
					productStore.createIndex("name", "name", { unique: false });
					productStore.createIndex("normalizedName", "normalizedName", { unique: false });
					productStore.createIndex("barcode", "barcode", { unique: false });
				}
				// Create inventory store
				if (!db.objectStoreNames.contains("inventory")) {
					const inventoryStore = db.createObjectStore("inventory", {
						keyPath: "id",
						autoIncrement: true
					});
					inventoryStore.createIndex("productId", "productId", { unique: false });
					inventoryStore.createIndex("expiryDate", "expiryDate", { unique: false });
					inventoryStore.createIndex("category", "category", { unique: false });
				}
				// Create settings store
				if (!db.objectStoreNames.contains("settings")) {
					db.createObjectStore("settings", { keyPath: "key" });
				}
			}
			// Migration from v1 to v2
			if (oldVersion < 2) {
				// Add barcode index if missing
				if (db.objectStoreNames.contains("products")) {
					const productStore = transaction.objectStore("products");
					if (!productStore.indexNames.contains("barcode")) {
						productStore.createIndex("barcode", "barcode", { unique: false });
					}
				}
			}
			// Migration from v2 to v3 - Add sync tracking
			if (oldVersion < 3) {
				// Create sync_log store for tracking changes
				if (!db.objectStoreNames.contains("sync_log")) {
					const syncStore = db.createObjectStore("sync_log", {
						keyPath: "id",
						autoIncrement: true
					});
					syncStore.createIndex("table", "table", { unique: false });
					syncStore.createIndex("recordId", "recordId", { unique: false });
					syncStore.createIndex("synced", "synced", { unique: false });
					syncStore.createIndex("timestamp", "timestamp", { unique: false });
				}
				// Add sync-related indexes to existing stores
				if (db.objectStoreNames.contains("products")) {
					const productStore = transaction.objectStore("products");
					if (!productStore.indexNames.contains("syncedAt")) {
						productStore.createIndex("syncedAt", "syncedAt", { unique: false });
					}
					if (!productStore.indexNames.contains("_deleted")) {
						productStore.createIndex("_deleted", "_deleted", { unique: false });
					}
				}
				if (db.objectStoreNames.contains("inventory")) {
					const inventoryStore = transaction.objectStore("inventory");
					if (!inventoryStore.indexNames.contains("syncedAt")) {
						inventoryStore.createIndex("syncedAt", "syncedAt", { unique: false });
					}
					if (!inventoryStore.indexNames.contains("_deleted")) {
						inventoryStore.createIndex("_deleted", "_deleted", { unique: false });
					}
				}
				if (db.objectStoreNames.contains("settings")) {
					const settingsStore = transaction.objectStore("settings");
					if (!settingsStore.indexNames.contains("syncedAt")) {
						settingsStore.createIndex("syncedAt", "syncedAt", { unique: false });
					}
				}
				// Migrate existing data to add new fields
				const productStore = transaction.objectStore("products");
				const inventoryStore = transaction.objectStore("inventory");
				// Add timestamps to existing products
				productStore.openCursor().onsuccess = (event) => {
					const cursor = event.target.result;
					if (cursor) {
						const product = cursor.value;
						if (!product.createdAt) product.createdAt = new Date().toISOString();
						if (!product.updatedAt) product.updatedAt = product.createdAt;
						product.syncedAt = null;
						product._deleted = false;
						cursor.update(product);
						cursor.continue();
					}
				};
				// Add timestamps to existing inventory items
				inventoryStore.openCursor().onsuccess = (event) => {
					const cursor = event.target.result;
					if (cursor) {
						const item = cursor.value;
						if (!item.addedAt) item.addedAt = new Date().toISOString();
						item.lastCheckedAt = item.addedAt;
						item.notificationSent = false;
						item.syncedAt = null;
						item._deleted = false;
						cursor.update(item);
						cursor.continue();
					}
				};
			}
			// Migration from v3 to v4 - Add catalog stores
			if (oldVersion < 4) {
				// Create products_catalog store for Open Food Facts data
				if (!db.objectStoreNames.contains("products_catalog")) {
					const catalogStore = db.createObjectStore("products_catalog", {
						keyPath: "id",
						autoIncrement: true
					});
					catalogStore.createIndex("barcode", "barcode", { unique: true });
					catalogStore.createIndex("name", "name", { unique: false });
					catalogStore.createIndex("normalizedName", "normalizedName", { unique: false });
					catalogStore.createIndex("category", "category", { unique: false });
					catalogStore.createIndex("brand", "brand", { unique: false });
					catalogStore.createIndex("source", "source", { unique: false });
					catalogStore.createIndex("updatedAt", "updatedAt", { unique: false });
				}
				// Create products_user store for user-customized templates
				if (!db.objectStoreNames.contains("products_user")) {
					const userStore = db.createObjectStore("products_user", {
						keyPath: "id",
						autoIncrement: true
					});
					userStore.createIndex("barcode", "barcode", { unique: false });
					userStore.createIndex("name", "name", { unique: false });
					userStore.createIndex("normalizedName", "normalizedName", { unique: false });
					userStore.createIndex("category", "category", { unique: false });
					userStore.createIndex("usageCount", "usageCount", { unique: false });
					userStore.createIndex("lastUsedAt", "lastUsedAt", { unique: false });
				}
				// Create products_index for fast search
				if (!db.objectStoreNames.contains("products_index")) {
					const indexStore = db.createObjectStore("products_index", {
						keyPath: "id",
						autoIncrement: true
					});
					indexStore.createIndex("searchKey", "searchKey", { unique: false });
					indexStore.createIndex("productId", "productId", { unique: false });
					indexStore.createIndex("sourceTable", "sourceTable", { unique: false });
					indexStore.createIndex("score", "score", { unique: false });
				}
				// Create catalog_metadata for version tracking
				if (!db.objectStoreNames.contains("catalog_metadata")) {
					db.createObjectStore("catalog_metadata", { keyPath: "key" });
				}
			}
			// Migration from v4 to v5 - Add consumption tracking and shopping list
			if (oldVersion < 5) {
				// Create consumption_log store
				if (!db.objectStoreNames.contains("consumption_log")) {
					const consumptionStore = db.createObjectStore("consumption_log", { keyPath: "id" });
					consumptionStore.createIndex("inventory_id", "inventory_id", { unique: false });
					consumptionStore.createIndex("product_id", "product_id", { unique: false });
					consumptionStore.createIndex("consumed_at", "consumed_at", { unique: false });
					consumptionStore.createIndex("category", "category", { unique: false });
				}
				// Create shopping_list store
				if (!db.objectStoreNames.contains("shopping_list")) {
					const shoppingStore = db.createObjectStore("shopping_list", { keyPath: "id" });
					shoppingStore.createIndex("product_id", "product_id", { unique: false });
					shoppingStore.createIndex("category", "category", { unique: false });
					shoppingStore.createIndex("priority", "priority", { unique: false });
					shoppingStore.createIndex("purchased", "purchased", { unique: false });
					shoppingStore.createIndex("created_at", "created_at", { unique: false });
				}
				// Create achievements store
				if (!db.objectStoreNames.contains("achievements")) {
					const achievementStore = db.createObjectStore("achievements", { keyPath: "id" });
					achievementStore.createIndex("unlocked_at", "unlocked_at", { unique: false });
					achievementStore.createIndex("type", "type", { unique: false });
				}
			}
			// Migration from v5 to v6 - Add alerts settings store
			if (oldVersion < 6) {
				if (!db.objectStoreNames.contains("alerts_settings")) {
					const alertsStore = db.createObjectStore("alerts_settings", { keyPath: "id" });
					alertsStore.createIndex("enabled", "enabled", { unique: false });
					alertsStore.createIndex("channel", "channel", { unique: false });
				}
			}
			// Migration from v6 to v7 - Categories store
			if (oldVersion < 7) {
				if (!db.objectStoreNames.contains("categories")) {
					const categoriesStore = db.createObjectStore("categories", {
						keyPath: "id",
						autoIncrement: true
					});
					categoriesStore.createIndex("slug", "slug", { unique: true });
					categoriesStore.createIndex("normalizedName", "normalizedName", { unique: true });
					categoriesStore.createIndex("archived", "archived", { unique: false });
					DEFAULT_CATEGORIES.forEach((cat) => {
						categoriesStore.add({
							...cat,
							normalizedName: normalizeText(cat.name),
							archived: false,
							createdAt: new Date().toISOString(),
							updatedAt: new Date().toISOString()
						});
					});
				}
			}
			// Migration from v7 to v8 - Add household_id support
			if (oldVersion < 8) {
				// Add household_id index to inventory store
				if (db.objectStoreNames.contains("inventory")) {
					const inventoryStore = transaction.objectStore("inventory");
					if (!inventoryStore.indexNames.contains("household_id")) {
						inventoryStore.createIndex("household_id", "household_id", { unique: false });
					}
				}
				// Add household_id index to products_user store
				if (db.objectStoreNames.contains("products_user")) {
					const userStore = transaction.objectStore("products_user");
					if (!userStore.indexNames.contains("household_id")) {
						userStore.createIndex("household_id", "household_id", { unique: false });
					}
				}
				// Add household_id index to consumption_log
				if (db.objectStoreNames.contains("consumption_log")) {
					const consumptionStore = transaction.objectStore("consumption_log");
					if (!consumptionStore.indexNames.contains("household_id")) {
						consumptionStore.createIndex("household_id", "household_id", { unique: false });
					}
				}
				// Add household_id index to shopping_list
				if (db.objectStoreNames.contains("shopping_list")) {
					const shoppingStore = transaction.objectStore("shopping_list");
					if (!shoppingStore.indexNames.contains("household_id")) {
						shoppingStore.createIndex("household_id", "household_id", { unique: false });
					}
				}
				// Create household_settings store for per-household configuration
				if (!db.objectStoreNames.contains("household_settings")) {
					const settingsStore = db.createObjectStore("household_settings", {
						keyPath: "id",
						autoIncrement: true
					});
					settingsStore.createIndex("household_id", "household_id", { unique: true });
					settingsStore.createIndex("key", "key", { unique: false });
				}
			}
		} });
	} catch (error) {
		console.error("Failed to initialize database:", error);
		throw new Error(`Database initialization failed: ${error.message}`);
	}
};
// Normalize text for matching (remove special chars, lowercase, trim)
const normalizeText = (text) => {
	if (!text) return "";
	return text.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim().replace(/\s+/g, " ");
};
const canonicalCategorySlug = (name) => {
	const normalized = normalizeText(name);
	if (!normalized) return "other";
	const lookup = {
		food: "food",
		water: "water",
		meds: "meds",
		medications: "meds",
		medicine: "meds",
		"batteries power": "batteriesPower",
		batteries: "batteriesPower",
		power: "batteriesPower",
		heating: "heating",
		heat: "heating",
		light: "light",
		hygiene: "hygiene",
		"first aid": "firstAid",
		tools: "tools",
		equipment: "tools",
		"tools equipment": "tools",
		other: "other"
	};
	if (lookup[normalized]) return lookup[normalized];
	// Fallback slug: kebab-case normalized text
	return normalized.replace(/\s+/g, "-").slice(0, 64);
};
const sanitizeCategoryName = (name) => {
	if (!name) return "Other";
	return name.trim().replace(/\s+/g, " ").slice(0, 80);
};
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
		const db = await initDB();
		const tx = db.transaction("sync_log", "readwrite");
		await tx.store.add({
			table,
			recordId,
			operation,
			timestamp: new Date().toISOString(),
			synced: false
		});
		await tx.done;
	} catch (error) {
		console.error("Failed to track change:", error);
	}
};
/**
* Get pending changes that need to be synced
* Includes the actual data for each changed record
*
* @returns {Array} Array of unsynced changes with data
*/
export const getPendingChanges = async () => {
	try {
		const db = await initDB();
		const tx = db.transaction([
			"sync_log",
			"products",
			"inventory",
			"settings"
		], "readonly");
		const index = tx.objectStore("sync_log").index("synced");
		// IndexedDB keys do not support booleans as query values in all browsers.
		// Fetch all logs from the index and filter unsynced changes client-side.
		const allLogs = await index.getAll();
		const logs = allLogs.filter((log) => log && log.synced === false);
		// Fetch actual data for each change
		const changes = [];
		for (const log of logs) {
			let data = null;
			if (log.operation !== "delete") {
				const store = tx.objectStore(log.table);
				data = await store.get(log.recordId);
			}
			changes.push({
				...log,
				data
			});
		}
		await tx.done;
		return changes;
	} catch (error) {
		console.error("Failed to get pending changes:", error);
		throw new Error(`Failed to retrieve pending changes: ${error.message}`);
	}
};
/**
* Mark a change as synced
*
* @param {string} table - Table name
* @param {number|string} recordId - Record ID
*/
export const markSynced = async (table, recordId) => {
	try {
		const db = await initDB();
		const tx = db.transaction("sync_log", "readwrite");
		const index = tx.store.index("recordId");
		let cursor = await index.openCursor(recordId);
		while (cursor) {
			if (cursor.value.table === table && !cursor.value.synced) {
				const record = cursor.value;
				record.synced = true;
				record.syncedAt = new Date().toISOString();
				await cursor.update(record);
			}
			cursor = await cursor.continue();
		}
		await tx.done;
		// Also update the record's syncedAt timestamp
		const recordTx = db.transaction(table, "readwrite");
		const recordStore = recordTx.objectStore(table);
		const record = await recordStore.get(recordId);
		if (record) {
			record.syncedAt = new Date().toISOString();
			await recordStore.put(record);
		}
		await recordTx.done;
	} catch (error) {
		console.error("Failed to mark change as synced:", error);
		throw new Error(`Failed to mark change as synced: ${error.message}`);
	}
};
/**
* Clear old synced logs (housekeeping)
* Removes synced logs older than specified days
*
* @param {number} daysToKeep - Number of days to keep synced logs (default: 30)
*/
export const clearOldSyncLogs = async (daysToKeep = 30) => {
	try {
		const db = await initDB();
		const cutoffDate = new Date();
		cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
		const cutoffISO = cutoffDate.toISOString();
		const tx = db.transaction("sync_log", "readwrite");
		const index = tx.store.index("synced");
		let cursor = await index.openCursor(true);
		let deleted = 0;
		while (cursor) {
			if (cursor.value.syncedAt && cursor.value.syncedAt < cutoffISO) {
				await cursor.delete();
				deleted++;
			}
			cursor = await cursor.continue();
		}
		await tx.done;
		console.log(`Cleared ${deleted} old sync logs`);
		return deleted;
	} catch (error) {
		console.error("Failed to clear old sync logs:", error);
	}
};
// ============================================================================
// CATEGORY OPERATIONS
// ============================================================================
const ensureCategoriesStore = async () => {
	try {
		const db = await initDB();
		if (!db.objectStoreNames.contains("categories")) {
			console.warn("Categories store missing; returning defaults");
			return null;
		}
		return db;
	} catch (error) {
		console.error("Failed to ensure categories store:", error);
		return null;
	}
};
export const getCategories = async ({ includeArchived = false } = {}) => {
	try {
		const db = await ensureCategoriesStore();
		if (!db) return DEFAULT_CATEGORIES;
		const tx = db.transaction("categories", "readonly");
		const items = await tx.store.getAll();
		await tx.done;
		const filtered = includeArchived ? items : items.filter((c) => !c.archived);
		if (!filtered.length) {
			// Seed defaults if empty
			const now = new Date().toISOString();
			const seedTx = db.transaction("categories", "readwrite");
			for (const cat of DEFAULT_CATEGORIES) {
				await seedTx.store.add({
					...cat,
					normalizedName: normalizeText(cat.name),
					archived: false,
					createdAt: now,
					updatedAt: now
				});
			}
			await seedTx.done;
			return DEFAULT_CATEGORIES;
		}
		return filtered;
	} catch (error) {
		console.error("Failed to load categories:", error);
		return DEFAULT_CATEGORIES;
	}
};
export const upsertCategory = async (input) => {
	const name = sanitizeCategoryName(typeof input === "string" ? input : input?.name);
	const slugFromInput = typeof input === "object" && input?.slug ? input.slug : null;
	const slug = slugFromInput || canonicalCategorySlug(name);
	const normalizedName = normalizeText(name);
	try {
		const db = await ensureCategoriesStore();
		if (!db) {
			const fallback = DEFAULT_CATEGORIES.find((c) => c.slug === slug);
			return fallback || {
				id: null,
				slug,
				name
			};
		}
		const tx = db.transaction("categories", "readwrite");
		const normalizedIndex = tx.store.index("normalizedName");
		const existing = await normalizedIndex.get(normalizedName);
		const now = new Date().toISOString();
		if (existing) {
			const updated = {
				...existing,
				name,
				slug,
				normalizedName,
				archived: false,
				updatedAt: now
			};
			await tx.store.put(updated);
			await tx.done;
			return updated;
		}
		const id = await tx.store.add({
			name,
			slug,
			normalizedName,
			archived: false,
			createdAt: now,
			updatedAt: now
		});
		await tx.done;
		return {
			id,
			name,
			slug,
			normalizedName,
			archived: false,
			createdAt: now,
			updatedAt: now
		};
	} catch (error) {
		console.error("Failed to upsert category:", error);
		return {
			id: null,
			name,
			slug
		};
	}
};
const updateCategorySlugInStore = async (db, storeName, sourceSlug, targetSlug) => {
	if (!db.objectStoreNames.contains(storeName)) return;
	const tx = db.transaction(storeName, "readwrite");
	let cursor = await tx.store.openCursor();
	while (cursor) {
		const value = cursor.value;
		if (value.category === sourceSlug) {
			value.category = targetSlug;
			await cursor.update(value);
		}
		cursor = await cursor.continue();
	}
	await tx.done;
};
export const mergeCategories = async (targetSlug, sourceSlugs = []) => {
	const uniqueSources = [...new Set(sourceSlugs)].filter((s) => s && s !== targetSlug);
	if (!targetSlug || uniqueSources.length === 0) return { updated: 0 };
	try {
		const db = await ensureCategoriesStore();
		if (!db) return { updated: 0 };
		const tx = db.transaction("categories", "readwrite");
		const slugIndex = tx.store.index("slug");
		const target = await slugIndex.get(targetSlug);
		if (!target) {
			await tx.done;
			throw new Error(`Target category ${targetSlug} not found`);
		}
		await tx.done;
		const storesToUpdate = [
			"products",
			"inventory",
			"shopping_list",
			"consumption_log",
			"products_user",
			"products_catalog"
		];
		let updates = 0;
		for (const sourceSlug of uniqueSources) {
			for (const store of storesToUpdate) {
				await updateCategorySlugInStore(db, store, sourceSlug, targetSlug);
			}
			const archiveTx = db.transaction("categories", "readwrite");
			const idx = archiveTx.store.index("slug");
			const sourceRecord = await idx.get(sourceSlug);
			if (sourceRecord) {
				sourceRecord.archived = true;
				sourceRecord.updatedAt = new Date().toISOString();
				await archiveTx.store.put(sourceRecord);
				updates++;
			}
			await archiveTx.done;
		}
		return { updated: updates };
	} catch (error) {
		console.error("Failed to merge categories:", error);
		return {
			updated: 0,
			error: error.message
		};
	}
};
export const getCategoryUsageCounts = async () => {
	const counts = {};
	try {
		const db = await initDB();
		const addCount = (slug) => {
			if (!slug) return;
			counts[slug] = counts[slug] ? counts[slug] + 1 : 1;
		};
		const inventory = await db.getAll("inventory");
		inventory.forEach((item) => addCount(item.category));
		const products = await db.getAll("products");
		products.forEach((p) => addCount(p.category));
		if (db.objectStoreNames.contains("shopping_list")) {
			const shopping = await db.getAll("shopping_list");
			shopping.forEach((item) => addCount(item.category));
		}
		return counts;
	} catch (error) {
		console.error("Failed to compute category usage counts:", error);
		return counts;
	}
};
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
		const db = await initDB();
		const normalizedName = normalizeText(product.name);
		const now = new Date().toISOString();
		const productData = {
			...product,
			normalizedName,
			createdAt: now,
			updatedAt: now,
			syncedAt: null,
			_deleted: false
		};
		const tx = db.transaction("products", "readwrite");
		const id = await tx.store.add(productData);
		await tx.done;
		// Track change for sync
		await trackChange("products", id, "create");
		return id;
	} catch (error) {
		console.error("Failed to add product:", error);
		throw new Error(`Failed to add product: ${error.message}`);
	}
};
/**
* Get all products (excluding deleted)
* @param {boolean} includeDeleted - Include soft-deleted products
* @returns {Array} Array of products
*/
export const getProducts = async (includeDeleted = false) => {
	try {
		const db = await initDB();
		const products = await db.getAll("products");
		if (includeDeleted) {
			return products;
		}
		return products.filter((p) => !p._deleted);
	} catch (error) {
		console.error("Failed to get products:", error);
		throw new Error(`Failed to retrieve products: ${error.message}`);
	}
};
/**
* Get product by ID
* @param {number} id - Product ID
* @returns {Object|null} Product or null if not found
*/
export const getProductById = async (id) => {
	try {
		const db = await initDB();
		const product = await db.get("products", id);
		return product && !product._deleted ? product : null;
	} catch (error) {
		console.error("Failed to get product:", error);
		throw new Error(`Failed to retrieve product: ${error.message}`);
	}
};
/**
* Get product by barcode
* @param {string} barcode - Product barcode
* @returns {Object|null} Product or null if not found
*/
export const getProductByBarcode = async (barcode) => {
	try {
		const db = await initDB();
		const tx = db.transaction("products", "readonly");
		const index = tx.store.index("barcode");
		const product = await index.get(barcode);
		await tx.done;
		return product && !product._deleted ? product : null;
	} catch (error) {
		console.error("Failed to get product by barcode:", error);
		return null;
	}
};
/**
* Find product by name (fuzzy matching)
* @param {string} scannedText - Text to search for
* @returns {Object|null} Matching product or null
*/
export const findProductByName = async (scannedText) => {
	try {
		const db = await initDB();
		const normalized = normalizeText(scannedText);
		const products = await db.getAll("products");
		// Find exact or partial match (excluding deleted)
		return products.find((p) => {
			if (p._deleted) return false;
			const productNormalized = p.normalizedName;
			return productNormalized.includes(normalized) || normalized.includes(productNormalized);
		});
	} catch (error) {
		console.error("Failed to find product:", error);
		return null;
	}
};
/**
* Update product
* @param {number} id - Product ID
* @param {Object} updates - Fields to update
*/
export const updateProduct = async (id, updates) => {
	try {
		const db = await initDB();
		const tx = db.transaction("products", "readwrite");
		const product = await tx.store.get(id);
		if (!product) {
			throw new Error(`Product with ID ${id} not found`);
		}
		const updatedProduct = {
			...product,
			...updates,
			updatedAt: new Date().toISOString(),
			syncedAt: null
		};
		// Update normalizedName if name changed
		if (updates.name && updates.name !== product.name) {
			updatedProduct.normalizedName = normalizeText(updates.name);
		}
		await tx.store.put(updatedProduct);
		await tx.done;
		// Track change for sync
		await trackChange("products", id, "update");
	} catch (error) {
		console.error("Failed to update product:", error);
		throw new Error(`Failed to update product: ${error.message}`);
	}
};
/**
* Delete product (soft delete)
* @param {number} id - Product ID
* @param {boolean} hard - Permanently delete (default: false)
*/
export const deleteProduct = async (id, hard = false) => {
	try {
		const db = await initDB();
		const tx = db.transaction("products", "readwrite");
		if (hard) {
			await tx.store.delete(id);
		} else {
			const product = await tx.store.get(id);
			if (product) {
				product._deleted = true;
				product.updatedAt = new Date().toISOString();
				product.syncedAt = null;
				await tx.store.put(product);
			}
		}
		await tx.done;
		// Track change for sync
		await trackChange("products", id, "delete");
	} catch (error) {
		console.error("Failed to delete product:", error);
		throw new Error(`Failed to delete product: ${error.message}`);
	}
};
/**
* Upsert product (insert or update)
* Used by sync engine to merge remote data
* @param {Object} product - Product data with id
*/
export const upsertProduct = async (product) => {
	try {
		const db = await initDB();
		const tx = db.transaction("products", "readwrite");
		// Attempt to find an existing product by barcode first to avoid
		// creating duplicates when syncing remote records that use different ids.
		let existing = null;
		try {
			if (product.barcode) {
				existing = await tx.store.index("barcode").get(product.barcode);
			}
		} catch (_err) {
			// Index might not exist in older DB versions - ignore and continue
			existing = null;
		}
		// If no match by barcode, try matching by provided id
		if (!existing && product.id) {
			existing = await tx.store.get(product.id);
		}
		let productData;
		if (existing) {
			// Merge records - prefer the most recently updated
			const existingTime = new Date(existing.updated_at || existing.updatedAt || 0);
			const remoteTime = new Date(product.updated_at || product.updatedAt || 0);
			productData = remoteTime >= existingTime ? {
				...existing,
				...product
			} : {
				...product,
				...existing
			};
			// Ensure we keep the local numeric id when present
			if (existing.id !== undefined) productData.id = existing.id;
		} else {
			productData = { ...product };
		}
		// Ensure normalized name
		if (productData.name && !productData.normalizedName) {
			productData.normalizedName = normalizeText(productData.name);
		}
		// Put will insert or update using the keyPath; prefer put so provided ids (UUIDs)
		// from remote are preserved when needed, but if we matched an existing record
		// the existing numeric id will be used.
		await tx.store.put(productData);
		await tx.done;
		return productData.id;
	} catch (error) {
		console.error("Failed to upsert product:", error);
		throw new Error(`Failed to upsert product: ${error.message}`);
	}
};
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
		if (!householdId) {
			throw new Error("Household ID is required to add inventory items");
		}
		const db = await initDB();
		const now = new Date().toISOString();
		const itemData = {
			...item,
			household_id: householdId,
			addedAt: now,
			lastCheckedAt: now,
			notificationSent: false,
			syncedAt: null,
			_deleted: false
		};
		const tx = db.transaction("inventory", "readwrite");
		const id = await tx.store.add(itemData);
		await tx.done;
		// Track change for sync
		await trackChange("inventory", id, "create");
		return id;
	} catch (error) {
		console.error("Failed to add inventory item:", error);
		throw new Error(`Failed to add inventory item: ${error.message}`);
	}
};
/**
* Get all inventory items for a household (excluding deleted)
* @param {string} householdId - Household ID
* @param {boolean} includeDeleted - Include soft-deleted items
* @returns {Array} Array of inventory items
*/
export const getInventory = async (householdId, includeDeleted = false) => {
	try {
		if (!householdId) {
			throw new Error("Household ID is required to retrieve inventory");
		}
		const db = await initDB();
		const items = await db.getAllFromIndex("inventory", "household_id", householdId);
		if (includeDeleted) {
			return items;
		}
		return items.filter((item) => !item._deleted);
	} catch (error) {
		console.error("Failed to get inventory:", error);
		throw new Error(`Failed to retrieve inventory: ${error.message}`);
	}
};
/**
* Get inventory items by product ID
* @param {number} productId - Product ID
* @returns {Array} Array of inventory items
*/
export const getInventoryByProduct = async (productId) => {
	try {
		const db = await initDB();
		const items = await db.getAllFromIndex("inventory", "productId", productId);
		return items.filter((item) => !item._deleted);
	} catch (error) {
		console.error("Failed to get inventory by product:", error);
		throw new Error(`Failed to retrieve inventory: ${error.message}`);
	}
};
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
			throw new Error("Household ID is required to retrieve inventory");
		}
		const db = await initDB();
		// Get all inventory items for household
		const inventoryItems = await db.getAllFromIndex("inventory", "household_id", householdId);
		const filteredInventory = includeDeleted ? inventoryItems : inventoryItems.filter((item) => !item._deleted);
		// Get all products for lookup
		const products = await db.getAll("products");
		const productMap = new Map(products.map((p) => [p.id, p]));
		// Enrich inventory items with product data
		return filteredInventory.map((item) => {
			const product = item.productId ? productMap.get(item.productId) : null;
			return {
				...item,
				imageUrl: product?.imageUrl || item.imageUrl || null,
				imageBlob: product?.imageBlob || item.imageBlob || null,
				brand: product?.brand || item.brand || null,
				barcode: product?.barcode || item.barcode || null,
				allergens: product?.allergens || item.allergens || null,
				nutrition: product?.nutrition || item.nutrition || null,
				ingredients: product?.ingredients || item.ingredients || null,
				productTemplate: product || null
			};
		});
	} catch (error) {
		console.error("Failed to get enriched inventory:", error);
		throw new Error(`Failed to retrieve enriched inventory: ${error.message}`);
	}
};
/**
* Update inventory item
* @param {number} id - Inventory ID
* @param {Object} updates - Fields to update
*/
export const updateInventoryItem = async (id, updates) => {
	try {
		const db = await initDB();
		const tx = db.transaction("inventory", "readwrite");
		const item = await tx.store.get(id);
		if (!item) {
			throw new Error(`Inventory item with ID ${id} not found`);
		}
		// Lightweight pre-write check: if cloud configured and authenticated,
		// fetch remote's updated_at and if it's newer than local syncedAt, abort with conflict.
		try {
			if (isNhostConfigured() && isNhostAuthenticated()) {
				const remote = await getInventoryById(id);
				if (remote && remote.updated_at && item.syncedAt && new Date(remote.updated_at) > new Date(item.syncedAt)) {
					const err = new Error("Conflict: remote version is newer than local copy");
					err.code = "conflict";
					throw err;
				}
			}
		} catch (precheckErr) {
			// If precheck throws a conflict error, bubble up. Otherwise log and continue.
			if (precheckErr && precheckErr.code === "conflict") throw precheckErr;
			console.warn("Pre-write remote check failed; proceeding with local update:", precheckErr.message);
		}
		const updatedItem = {
			...item,
			...updates,
			lastCheckedAt: new Date().toISOString(),
			syncedAt: null
		};
		await tx.store.put(updatedItem);
		await tx.done;
		// Track change for sync
		await trackChange("inventory", id, "update");
		// Trigger background sync (best-effort)
		try {
			syncToCloud().catch((e) => console.warn("Background sync failed:", e.message || e));
		} catch (e) {
			console.warn("Failed to trigger background sync:", e.message || e);
		}
	} catch (error) {
		console.error("Failed to update inventory item:", error);
		throw new Error(`Failed to update inventory item: ${error.message}`);
	}
};
/**
* Sync pending local changes to the cloud via GraphQL
* - Currently handles inventory create/update/delete in batches
*/
export const syncToCloud = async () => {
	try {
		if (!isNhostConfigured() || !isNhostAuthenticated()) {
			return {
				success: false,
				reason: "Not configured or not authenticated"
			};
		}
		const pending = await getPendingChanges();
		if (!pending || pending.length === 0) return {
			success: true,
			synced: 0
		};
		// Group inventory changes
		const inventoryUpserts = [];
		const inventoryDeletes = [];
		for (const change of pending) {
			if (change.table !== "inventory") continue;
			if (change.operation === "delete") {
				inventoryDeletes.push(change.recordId);
			} else if (change.data) {
				// Map local data to a server-friendly shape. Server schema may need to accept these fields.
				const obj = {
					id: change.data.id,
					household_id: change.data.household_id,
					product_id: change.data.productId || null,
					quantity: change.data.quantity || null,
					expiry_date: change.data.expiryDate || null,
					added_at: change.data.addedAt || null,
					_deleted: !!change.data._deleted,
					allowGracePeriod: !!change.data.allowGracePeriod,
					gracePeriodMonths: change.data.gracePeriodMonths || null,
					imageUrl: change.data.imageUrl || null
				};
				inventoryUpserts.push(obj);
			}
		}
		let syncedCount = 0;
		// Send upserts (safe: mark only returned ids as synced)
		if (inventoryUpserts.length > 0) {
			try {
				const res = await upsertInventoryBatch(inventoryUpserts);
				const returnedIds = (res || []).map((r) => r.id).filter(Boolean);
				syncedCount += returnedIds.length;
				// Mark local logs as synced only for returned ids
				for (const id of returnedIds) {
					try {
						await markSynced("inventory", id);
					} catch (e) {
						console.warn("Failed to mark upserted record as synced:", id, e.message || e);
					}
				}
				// If some requested IDs did not return, log for inspection
				if (returnedIds.length < inventoryUpserts.length) {
					console.warn(`[SYNC] Partial upsert: requested=${inventoryUpserts.length} returned=${returnedIds.length}`);
				}
			} catch (upErr) {
				console.error("[SYNC] upsertInventoryBatch failed, leaving changes unsynced:", upErr);
			}
		}
		// Send deletes
		if (inventoryDeletes.length > 0) {
			try {
				const delRes = await deleteInventoryBatch(inventoryDeletes);
				const affected = delRes?.affected_rows || 0;
				// If delete reports affected rows equal to requested, mark as synced
				if (affected > 0) {
					for (const id of inventoryDeletes) {
						try {
							await markSynced("inventory", id);
						} catch (e) {
							console.warn("Failed to mark deleted record as synced:", id, e.message || e);
						}
					}
					syncedCount += affected;
				} else {
					console.warn("[SYNC] deleteInventoryBatch reported 0 affected rows");
				}
			} catch (delErr) {
				console.error("[SYNC] deleteInventoryBatch failed, leaving deletes unsynced:", delErr);
			}
		}
		// Update last sync setting (global) only if we synced something
		if (syncedCount > 0) {
			try {
				await setSetting("lastSync", new Date().toISOString());
			} catch (e) {
				console.warn("Failed to update lastSync setting:", e.message || e);
			}
		}
		return {
			success: true,
			synced: syncedCount
		};
	} catch (err) {
		console.error("syncToCloud failed:", err);
		throw err;
	}
};
/**
* Delete inventory item (soft delete)
* @param {number} id - Inventory ID
* @param {boolean} hard - Permanently delete (default: false)
*/
export const deleteInventoryItem = async (id, hard = false) => {
	try {
		const db = await initDB();
		const tx = db.transaction("inventory", "readwrite");
		if (hard) {
			await tx.store.delete(id);
		} else {
			const item = await tx.store.get(id);
			if (item) {
				item._deleted = true;
				item.lastCheckedAt = new Date().toISOString();
				item.syncedAt = null;
				await tx.store.put(item);
			}
		}
		await tx.done;
		// Track change for sync
		await trackChange("inventory", id, "delete");
	} catch (error) {
		console.error("Failed to delete inventory item:", error);
		throw new Error(`Failed to delete inventory item: ${error.message}`);
	}
};
/**
* Upsert inventory item (insert or update)
* Used by sync engine to merge remote data
* @param {Object} item - Inventory item data with id
*/
export const upsertInventoryItem = async (item) => {
	try {
		const db = await initDB();
		const tx = db.transaction("inventory", "readwrite");
		const existing = await tx.store.get(item.id);
		let itemData;
		if (existing) {
			// Merge, keeping newer data (conflict resolution)
			const existingTime = new Date(existing.updated_at || existing.updatedAt || existing.lastCheckedAt || 0);
			const remoteTime = new Date(item.updated_at || item.updatedAt || item.lastCheckedAt || 0);
			itemData = remoteTime >= existingTime ? item : existing;
		} else {
			itemData = item;
		}
		await tx.store.put(itemData);
		await tx.done;
		return itemData.id;
	} catch (error) {
		console.error("Failed to upsert inventory item:", error);
		throw new Error(`Failed to upsert inventory item: ${error.message}`);
	}
};
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
			throw new Error("Household ID is required to get inventory stats");
		}
		const db = await initDB();
		const inventory = await db.getAllFromIndex("inventory", "household_id", householdId);
		const activeInventory = inventory.filter((item) => !item._deleted);
		const now = new Date();
		const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1e3);
		return {
			totalItems: activeInventory.length,
			expiringSoon: activeInventory.filter((item) => {
				if (!item.expiryDate) return false;
				const expiryDate = new Date(item.expiryDate);
				return expiryDate <= thirtyDaysFromNow && expiryDate > now;
			}).length
		};
	} catch (error) {
		console.error("Failed to get inventory stats:", error);
		return {
			totalItems: 0,
			expiringSoon: 0
		};
	}
};
/**
* Get inventory items grouped by DSB category for a household
* @param {string} householdId - Household ID
* @returns {Object} Object with DSB category keys and item quantities
*/
export const getInventoryByDsbCategory = async (householdId) => {
	try {
		if (!householdId) {
			throw new Error("Household ID is required to get inventory by category");
		}
		const db = await initDB();
		const inventory = await db.getAllFromIndex("inventory", "household_id", householdId);
		const activeInventory = inventory.filter((item) => !item._deleted);
		// Map supply categories to DSB categories
		const { getDsbCategory } = require("./constants/categories");
		const categoryCounts = {
			water: 0,
			food: 0,
			medications: 0,
			firstAid: 0,
			hygiene: 0,
			warmth: 0,
			light: 0,
			documents: 0,
			tools: 0
		};
		activeInventory.forEach((item) => {
			const dsbCategory = getDsbCategory(item.category);
			if (dsbCategory && categoryCounts.hasOwnProperty(dsbCategory)) {
				// For most items, count 1 per item. For water/food, use quantity if available
				const quantityToAdd = item.quantity || 1;
				if (dsbCategory === "water" || dsbCategory === "food") {
					categoryCounts[dsbCategory] += quantityToAdd;
				} else {
					categoryCounts[dsbCategory] += 1;
				}
			}
		});
		return categoryCounts;
	} catch (error) {
		console.error("Failed to get inventory by DSB category:", error);
		return {
			water: 0,
			food: 0,
			medications: 0,
			firstAid: 0,
			hygiene: 0,
			warmth: 0,
			light: 0,
			documents: 0,
			tools: 0
		};
	}
};
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
		const db = await initDB();
		const setting = await db.get("settings", key);
		return setting ? setting.value : null;
	} catch (error) {
		console.error("Failed to get setting:", error);
		return null;
	}
};
/**
* Set setting value
* @param {string} key - Setting key
* @param {*} value - Setting value
*/
export const setSetting = async (key, value) => {
	try {
		const db = await initDB();
		const tx = db.transaction("settings", "readwrite");
		await tx.store.put({
			key,
			value,
			updatedAt: new Date().toISOString(),
			syncedAt: null
		});
		await tx.done;
		// Track change for sync
		await trackChange("settings", key, "update");
	} catch (error) {
		console.error("Failed to set setting:", error);
		throw new Error(`Failed to save setting: ${error.message}`);
	}
};
/**
* Field preferences default configuration
* Defines all available inventory fields and their default visibility/mandatory status
*/
const DEFAULT_FIELD_PREFERENCES = {
	barcode: {
		visible: true,
		mandatory: false,
		label: "Barcode"
	},
	productName: {
		visible: true,
		mandatory: true,
		label: "Product Name"
	},
	quantity: {
		visible: true,
		mandatory: true,
		label: "Quantity"
	},
	unit: {
		visible: true,
		mandatory: false,
		label: "Unit"
	},
	expiryDate: {
		visible: true,
		mandatory: true,
		label: "Expiry Date"
	},
	category: {
		visible: true,
		mandatory: true,
		label: "Category"
	},
	allergens: {
		visible: true,
		mandatory: false,
		label: "Allergens"
	},
	storageLocation: {
		visible: true,
		mandatory: false,
		label: "Storage Location"
	},
	cost: {
		visible: false,
		mandatory: false,
		label: "Cost/Price"
	},
	purchaseDate: {
		visible: true,
		mandatory: false,
		label: "Purchase Date"
	},
	preferredConsumptionDate: {
		visible: false,
		mandatory: false,
		label: "Preferred Consumption Date"
	},
	supplier: {
		visible: false,
		mandatory: false,
		label: "Supplier/Source"
	},
	storageNotes: {
		visible: false,
		mandatory: false,
		label: "Storage Notes"
	},
	itemStatus: {
		visible: false,
		mandatory: false,
		label: "Item Status"
	},
	lotNumber: {
		visible: false,
		mandatory: false,
		label: "Lot/Batch Number"
	},
	nutritionInfo: {
		visible: false,
		mandatory: false,
		label: "Nutritional Value"
	},
	dietaryRestrictions: {
		visible: false,
		mandatory: false,
		label: "Dietary Restrictions"
	},
	priorityLevel: {
		visible: false,
		mandatory: false,
		label: "Priority Level"
	},
	packaging: {
		visible: false,
		mandatory: false,
		label: "Packaging Details"
	}
};
/**
* Get field preferences for the user
* Returns default preferences if not set
*/
export const getFieldPreferences = async () => {
	try {
		const prefs = await getSetting("fieldPreferences");
		if (!prefs) {
			return DEFAULT_FIELD_PREFERENCES;
		}
		// Merge with defaults to ensure new fields are included
		return {
			...DEFAULT_FIELD_PREFERENCES,
			...prefs
		};
	} catch (error) {
		console.error("Failed to get field preferences:", error);
		return DEFAULT_FIELD_PREFERENCES;
	}
};
/**
* Set field preferences
* @param {Object} preferences - Field preferences object
*/
export const setFieldPreferences = async (preferences) => {
	try {
		const merged = {
			...DEFAULT_FIELD_PREFERENCES,
			...preferences
		};
		await setSetting("fieldPreferences", merged);
		return merged;
	} catch (error) {
		console.error("Failed to set field preferences:", error);
		throw new Error(`Failed to save field preferences: ${error.message}`);
	}
};
/**
* Reset field preferences to defaults
*/
export const resetFieldPreferences = async () => {
	try {
		await setSetting("fieldPreferences", DEFAULT_FIELD_PREFERENCES);
		return DEFAULT_FIELD_PREFERENCES;
	} catch (error) {
		console.error("Failed to reset field preferences:", error);
		throw new Error(`Failed to reset field preferences: ${error.message}`);
	}
};
/**
* Get visible and mandatory fields
* @returns {Object} Object with visibleFields and mandatoryFields arrays
*/
export const getActiveFieldConfig = async () => {
	const prefs = await getFieldPreferences();
	const visibleFields = Object.keys(prefs).filter((key) => prefs[key].visible);
	const mandatoryFields = Object.keys(prefs).filter((key) => prefs[key].mandatory);
	return {
		visibleFields,
		mandatoryFields,
		preferences: prefs
	};
};
/**
* Get household size
* @returns {Object} Household size {adults, children}
*/
export const getHouseholdSize = async () => {
	try {
		const size = await getSetting("householdSize");
		return size || {
			adults: 1,
			children: 0
		};
	} catch (error) {
		console.error("Failed to get household size:", error);
		return {
			adults: 1,
			children: 0
		};
	}
};
/**
* Set household size
* @param {number} adults - Number of adults
* @param {number} children - Number of children
*/
export const setHouseholdSize = async (adults, children) => {
	try {
		await setSetting("householdSize", {
			adults,
			children
		});
	} catch (error) {
		console.error("Failed to set household size:", error);
		throw error;
	}
};
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
		const inventory = await getInventory();
		// MVP v2 simplified: calculate readiness based on item count and expiry
		const totalItems = inventory.length;
		const expiringItems = inventory.filter((item) => {
			if (!item.expiryDate) return false;
			const days = Math.ceil((new Date(item.expiryDate) - new Date()) / (1e3 * 60 * 60 * 24));
			return days <= 30 && days > 0;
		}).length;
		// Simple readiness: 100% if have items, lower if expiring soon
		const totalMet = totalItems - expiringItems;
		const percentage = totalItems > 0 ? Math.round(totalMet / totalItems * 100) : 0;
		return {
			percentage,
			totalRequired: totalItems,
			totalMet,
			missing: expiringItems
		};
	} catch (error) {
		console.error("Failed to calculate readiness:", error);
		return {
			percentage: 0,
			totalRequired: 0,
			totalMet: 0,
			missing: 0
		};
	}
};
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
		const db = await initDB();
		const tx = db.transaction("sync_log", "readwrite");
		const syncEntry = {
			operation,
			tableName,
			recordId,
			changes,
			status: "pending",
			createdAt: new Date().toISOString(),
			syncedAt: null
		};
		const id = await tx.store.add(syncEntry);
		await tx.done;
		console.log(`[SYNC LOG] Added ${operation} for ${tableName}:${recordId}`);
		return id;
	} catch (error) {
		console.error("Failed to add sync log:", error);
		throw error;
	}
};
/**
* Get sync log entries
* @param {string} status - Filter by status ('pending', 'synced', 'failed')
* @returns {Array} Sync log entries
*/
export const getSyncLog = async (status = null) => {
	try {
		const db = await initDB();
		const logs = await db.getAll("sync_log");
		if (status) {
			return logs.filter((log) => log.status === status);
		}
		return logs;
	} catch (error) {
		console.error("Failed to get sync log:", error);
		return [];
	}
};
/**
* Get pending syncs
* @returns {Array} Pending sync entries
*/
export const getPendingSyncs = async () => {
	return getSyncLog("pending");
};
/**
* Mark sync entry as successful
* @param {number} syncId - ID of sync log entry
*/
export const markSyncSuccess = async (syncId) => {
	try {
		const db = await initDB();
		const tx = db.transaction("sync_log", "readwrite");
		const entry = await tx.store.get(syncId);
		if (entry) {
			entry.status = "synced";
			entry.syncedAt = new Date().toISOString();
			await tx.store.put(entry);
		}
		await tx.done;
		console.log(`[SYNC] Marked sync ${syncId} as successful`);
	} catch (error) {
		console.error("Failed to mark sync success:", error);
	}
};
/**
* Mark sync entry as failed
* @param {number} syncId - ID of sync log entry
* @param {string} errorMessage - Error description
*/
export const markSyncFailed = async (syncId, errorMessage) => {
	try {
		const db = await initDB();
		const tx = db.transaction("sync_log", "readwrite");
		const entry = await tx.store.get(syncId);
		if (entry) {
			entry.status = "failed";
			entry.errorMessage = errorMessage;
			await tx.store.put(entry);
		}
		await tx.done;
		console.log(`[SYNC] Marked sync ${syncId} as failed: ${errorMessage}`);
	} catch (error) {
		console.error("Failed to mark sync failed:", error);
	}
};
/**
* Clear all synced entries from sync log
*/
export const clearSyncLog = async () => {
	try {
		const db = await initDB();
		const tx = db.transaction("sync_log", "readwrite");
		const logs = await tx.store.getAll();
		for (const log of logs) {
			if (log.status === "synced") {
				await tx.store.delete(log.createdAt);
			}
		}
		await tx.done;
		console.log("[SYNC] Cleared synced entries from sync log");
	} catch (error) {
		console.error("Failed to clear sync log:", error);
	}
};
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
		item_status: item.itemStatus || "unopened",
		storage_notes: item.storageNotes || null,
		allergens: item.allergens || null,
		dietary_restrictions: item.dietaryRestrictions || [],
		cost: item.cost ? parseFloat(item.cost) : null,
		supplier: item.supplier || null,
		lot_number: item.lotNumber || null,
		nutrition_info: item.nutritionInfo || null,
		priority_level: item.priorityLevel || "important",
		packaging: item.packaging || null
	};
	return nhostItem;
}
/**
* Sync offline inventory items to Nhost
* @param {Object} nhostClient - Nhost client instance
* @returns {Object} Sync results
*/
export const syncToNhost = async (nhostClient) => {
	if (!nhostClient || !nhostClient.graphql.request) {
		console.warn("[SYNC] Nhost client not available, skipping sync");
		return {
			success: false,
			synced: 0,
			failed: 0,
			message: "Nhost not configured"
		};
	}
	try {
		const pendingSyncs = await getPendingSyncs();
		if (pendingSyncs.length === 0) {
			console.log("[SYNC] No pending syncs");
			return {
				success: true,
				synced: 0,
				failed: 0,
				message: "No pending items"
			};
		}
		console.log(`[SYNC] Starting sync of ${pendingSyncs.length} items`);
		let synced = 0;
		let failed = 0;
		for (const syncEntry of pendingSyncs) {
			try {
				const { operation, tableName, recordId, changes } = syncEntry;
				if (tableName !== "inventory") {
					await markSyncSuccess(syncEntry.createdAt);
					synced++;
					continue;
				}
				// Build GraphQL mutation for inventory
				let mutation;
				let variables = { data: convertToNhostFormat(changes) };
				if (operation === "create") {
					mutation = `
            mutation CreateInventoryItem($data: inventory_insert_input!) {
              insert_inventory_one(object: $data) {
                id
              }
            }
          `;
				} else if (operation === "update") {
					mutation = `
            mutation UpdateInventoryItem($id: uuid!, $data: inventory_set_input!) {
              update_inventory_by_pk(pk_columns: { id: $id }, _set: $data) {
                id
              }
            }
          `;
					variables.id = recordId;
				} else if (operation === "delete") {
					mutation = `
            mutation DeleteInventoryItem($id: uuid!) {
              delete_inventory_by_pk(id: $id) {
                id
              }
            }
          `;
					variables.id = recordId;
				}
				if (!mutation) {
					await markSyncFailed(syncEntry.createdAt, "Unknown operation");
					failed++;
					continue;
				}
				// Execute mutation
				await nhostClient.graphql.request({
					query: mutation,
					variables
				});
				await markSyncSuccess(syncEntry.createdAt);
				synced++;
			} catch (itemError) {
				console.error(`[SYNC] Failed to sync item:`, itemError);
				await markSyncFailed(syncEntry.createdAt, itemError.message);
				failed++;
			}
		}
		console.log(`[SYNC] Completed: ${synced} synced, ${failed} failed`);
		return {
			success: failed === 0,
			synced,
			failed,
			message: `Synced ${synced} items${failed > 0 ? `, ${failed} failed` : ""}`
		};
	} catch (error) {
		console.error("[SYNC] Sync failed:", error);
		return {
			success: false,
			synced: 0,
			failed: 0,
			message: error.message
		};
	}
};
/**
* Fetch changes from cloud and apply to local DB for a household
* - Uses server `updated_at` as authoritative timestamp
*/
export const fetchFromCloud = async (householdId) => {
	try {
		if (!householdId) throw new Error("householdId required");
		if (!isNhostConfigured() || !isNhostAuthenticated()) {
			return {
				success: false,
				reason: "Not configured or not authenticated"
			};
		}
		// Last sync per-household
		const lastSyncKey = `lastSync:${householdId}`;
		const lastSync = await getSetting(lastSyncKey) || new Date(0).toISOString();
		const changes = await getInventoryChangesSince(lastSync, householdId);
		if (!changes || changes.length === 0) {
			await setSetting(lastSyncKey, new Date().toISOString());
			return {
				success: true,
				applied: 0
			};
		}
		const db = await initDB();
		const tx = db.transaction("inventory", "readwrite");
		let applied = 0;
		for (const row of changes) {
			const existing = await tx.store.get(row.id);
			if (row._deleted) {
				if (existing) {
					existing._deleted = true;
					existing.syncedAt = row.updated_at || new Date().toISOString();
					await tx.store.put(existing);
				} else {
					// create tombstone
					await tx.store.put({
						id: row.id,
						household_id: row.household_id,
						_deleted: true,
						syncedAt: row.updated_at || new Date().toISOString()
					});
				}
				applied++;
				continue;
			}
			const toPut = {
				id: row.id,
				household_id: row.household_id,
				productId: row.product_id || null,
				quantity: row.quantity || null,
				expiryDate: row.expiry_date || null,
				addedAt: row.added_at || new Date().toISOString(),
				lastCheckedAt: row.updated_at || new Date().toISOString(),
				notificationSent: false,
				syncedAt: row.updated_at || new Date().toISOString(),
				_deleted: !!row._deleted,
				allowGracePeriod: !!row.allowGracePeriod,
				gracePeriodMonths: row.gracePeriodMonths || null,
				imageUrl: row.imageUrl || null
			};
			await tx.store.put({
				...existing,
				...toPut
			});
			applied++;
		}
		await tx.done;
		// Update lastSync marker
		await setSetting(lastSyncKey, new Date().toISOString());
		return {
			success: true,
			applied
		};
	} catch (err) {
		console.error("fetchFromCloud failed:", err);
		throw err;
	}
};
/**
* Force update inventory item without pre-write remote check.
* Use this when the user explicitly chooses to overwrite remote data.
*/
export const updateInventoryItemForce = async (id, updates) => {
	try {
		const db = await initDB();
		const tx = db.transaction("inventory", "readwrite");
		const item = await tx.store.get(id);
		if (!item) {
			throw new Error(`Inventory item with ID ${id} not found`);
		}
		const updatedItem = {
			...item,
			...updates,
			lastCheckedAt: new Date().toISOString(),
			syncedAt: null
		};
		await tx.store.put(updatedItem);
		await tx.done;
		// Track change for sync
		await trackChange("inventory", id, "update");
		// Trigger background sync (best-effort)
		try {
			syncToCloud().catch((e) => console.warn("Background sync failed:", e.message || e));
		} catch (e) {
			console.warn("Failed to trigger background sync:", e.message || e);
		}
	} catch (error) {
		console.error("Failed to force update inventory item:", error);
		throw new Error(`Failed to update inventory item: ${error.message}`);
	}
};
/**
* Get a single inventory item by id from local DB
*/
export const getInventoryItem = async (id) => {
	try {
		const db = await initDB();
		const item = await db.get("inventory", id);
		return item || null;
	} catch (err) {
		console.error("Failed to get inventory item:", err);
		throw err;
	}
};

//# sourceMappingURL=data:application/json;base64,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TUFBTTtBQUNULFNBQU0sSUFBSSxNQUFNLDBCQUEwQixHQUFHLFlBQVk7O0VBRzNELE1BQU0sY0FBYztHQUNsQixHQUFHO0dBQ0gsR0FBRztHQUNILGVBQWUsSUFBSSxNQUFNLENBQUMsYUFBYTtHQUN2QyxVQUFVO0dBQ1g7QUFFRCxRQUFNLEdBQUcsTUFBTSxJQUFJLFlBQVk7QUFDL0IsUUFBTSxHQUFHOztBQUdULFFBQU0sWUFBWSxhQUFhLElBQUksU0FBUzs7QUFHNUMsTUFBSTtBQUNGLGdCQUFhLENBQUMsT0FBTyxNQUFNLFFBQVEsS0FBSywyQkFBMkIsRUFBRSxXQUFXLEVBQUUsQ0FBQztXQUM1RSxHQUFHO0FBQ1YsV0FBUSxLQUFLLHNDQUFzQyxFQUFFLFdBQVcsRUFBRTs7VUFFN0QsT0FBTztBQUNkLFVBQVEsTUFBTSwwQ0FBMEMsTUFBTTtBQUM5RCxRQUFNLElBQUksTUFBTSxvQ0FBb0MsTUFBTSxVQUFVOzs7Ozs7QUFPeEUsT0FBTyxNQUFNLG1CQUFtQixPQUFPLE9BQU87QUFDNUMsS0FBSTtFQUNGLE1BQU0sS0FBSyxNQUFNLFFBQVE7RUFDekIsTUFBTSxPQUFPLE1BQU0sR0FBRyxJQUFJLGFBQWEsR0FBRztBQUMxQyxTQUFPLFFBQVE7VUFDUixLQUFLO0FBQ1osVUFBUSxNQUFNLGlDQUFpQyxJQUFJO0FBQ25ELFFBQU0iLCJuYW1lcyI6W10sInNvdXJjZXMiOlsiZGF0YWJhc2UuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgb3BlbkRCIH0gZnJvbSAnaWRiJ1xyXG5pbXBvcnQge1xyXG4gIGlzTmhvc3RDb25maWd1cmVkLFxyXG4gIGlzTmhvc3RBdXRoZW50aWNhdGVkLFxyXG4gIHVwc2VydEludmVudG9yeUJhdGNoLFxyXG4gIGRlbGV0ZUludmVudG9yeUJhdGNoLFxyXG4gIGdldEludmVudG9yeUJ5SWQsXHJcbiAgZ2V0SW52ZW50b3J5Q2hhbmdlc1NpbmNlLFxyXG59IGZyb20gJy4vbmhvc3QnXHJcblxyXG4vLyBSZS1leHBvcnQgbmhvc3QgaGVscGVyIHNvIGNvbnN1bWVycyBjYW4gaW1wb3J0IGZyb20gYC4uL2RhdGFiYXNlYFxyXG5leHBvcnQgeyBnZXRJbnZlbnRvcnlCeUlkIH1cclxuXHJcbmNvbnN0IERCX05BTUUgPSAnZW1lcmdlbmN5LXN1cHBseS1kYidcclxuY29uc3QgREJfVkVSU0lPTiA9IDggLy8gdjggYWRkcyBob3VzZWhvbGRfaWQgdG8gaW52ZW50b3J5IGFuZCBvdGhlciBzdG9yZXNcclxuXHJcbmNvbnN0IERFRkFVTFRfQ0FURUdPUklFUyA9IFtcclxuICB7IHNsdWc6ICdmb29kJywgbmFtZTogJ0Zvb2QnIH0sXHJcbiAgeyBzbHVnOiAnd2F0ZXInLCBuYW1lOiAnV2F0ZXInIH0sXHJcbiAgeyBzbHVnOiAnbWVkcycsIG5hbWU6ICdNZWRpY2F0aW9ucycgfSxcclxuICB7IHNsdWc6ICdiYXR0ZXJpZXNQb3dlcicsIG5hbWU6ICdCYXR0ZXJpZXMgJiBQb3dlcicgfSxcclxuICB7IHNsdWc6ICdoZWF0aW5nJywgbmFtZTogJ0hlYXRpbmcnIH0sXHJcbiAgeyBzbHVnOiAnbGlnaHQnLCBuYW1lOiAnTGlnaHQnIH0sXHJcbiAgeyBzbHVnOiAnaHlnaWVuZScsIG5hbWU6ICdIeWdpZW5lJyB9LFxyXG4gIHsgc2x1ZzogJ2ZpcnN0QWlkJywgbmFtZTogJ0ZpcnN0IEFpZCcgfSxcclxuICB7IHNsdWc6ICd0b29scycsIG5hbWU6ICdUb29scyAmIEVxdWlwbWVudCcgfSxcclxuICB7IHNsdWc6ICdvdGhlcicsIG5hbWU6ICdPdGhlcicgfSxcclxuXVxyXG5cclxuZXhwb3J0IGNvbnN0IENBVEVHT1JZX0RFRkFVTFRTID0gREVGQVVMVF9DQVRFR09SSUVTXHJcblxyXG4vKipcclxuICogSW5pdGlhbGl6ZSBkYXRhYmFzZSB3aXRoIG1pZ3JhdGlvbiBzdXBwb3J0XHJcbiAqIFNjaGVtYSB2MyBpbmNsdWRlcyBzeW5jIHRyYWNraW5nIGFuZCBlbmhhbmNlZCBmaWVsZHNcclxuICovXHJcbmNvbnN0IGluaXREQiA9IGFzeW5jICgpID0+IHtcclxuICB0cnkge1xyXG4gICAgcmV0dXJuIGF3YWl0IG9wZW5EQihEQl9OQU1FLCBEQl9WRVJTSU9OLCB7XHJcbiAgICAgIHVwZ3JhZGUoZGIsIG9sZFZlcnNpb24sIG5ld1ZlcnNpb24sIHRyYW5zYWN0aW9uKSB7XHJcbiAgICAgICAgY29uc29sZS5sb2coYFVwZ3JhZGluZyBkYXRhYmFzZSBmcm9tIHYke29sZFZlcnNpb259IHRvIHYke25ld1ZlcnNpb259YClcclxuXHJcbiAgICAgICAgLy8gTWlncmF0aW9uIGZyb20gdjAgKG5vIGRhdGFiYXNlKSBvciB2MSB0byBjdXJyZW50XHJcbiAgICAgICAgaWYgKG9sZFZlcnNpb24gPCAxKSB7XHJcbiAgICAgICAgICAvLyBDcmVhdGUgcHJvZHVjdHMgc3RvcmVcclxuICAgICAgICAgIGlmICghZGIub2JqZWN0U3RvcmVOYW1lcy5jb250YWlucygncHJvZHVjdHMnKSkge1xyXG4gICAgICAgICAgICBjb25zdCBwcm9kdWN0U3RvcmUgPSBkYi5jcmVhdGVPYmplY3RTdG9yZSgncHJvZHVjdHMnLCB7XHJcbiAgICAgICAgICAgICAga2V5UGF0aDogJ2lkJyxcclxuICAgICAgICAgICAgICBhdXRvSW5jcmVtZW50OiB0cnVlLFxyXG4gICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICBwcm9kdWN0U3RvcmUuY3JlYXRlSW5kZXgoJ25hbWUnLCAnbmFtZScsIHsgdW5pcXVlOiBmYWxzZSB9KVxyXG4gICAgICAgICAgICBwcm9kdWN0U3RvcmUuY3JlYXRlSW5kZXgoJ25vcm1hbGl6ZWROYW1lJywgJ25vcm1hbGl6ZWROYW1lJywgeyB1bmlxdWU6IGZhbHNlIH0pXHJcbiAgICAgICAgICAgIHByb2R1Y3RTdG9yZS5jcmVhdGVJbmRleCgnYmFyY29kZScsICdiYXJjb2RlJywgeyB1bmlxdWU6IGZhbHNlIH0pXHJcbiAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgLy8gQ3JlYXRlIGludmVudG9yeSBzdG9yZVxyXG4gICAgICAgICAgaWYgKCFkYi5vYmplY3RTdG9yZU5hbWVzLmNvbnRhaW5zKCdpbnZlbnRvcnknKSkge1xyXG4gICAgICAgICAgICBjb25zdCBpbnZlbnRvcnlTdG9yZSA9IGRiLmNyZWF0ZU9iamVjdFN0b3JlKCdpbnZlbnRvcnknLCB7XHJcbiAgICAgICAgICAgICAga2V5UGF0aDogJ2lkJyxcclxuICAgICAgICAgICAgICBhdXRvSW5jcmVtZW50OiB0cnVlLFxyXG4gICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICBpbnZlbnRvcnlTdG9yZS5jcmVhdGVJbmRleCgncHJvZHVjdElkJywgJ3Byb2R1Y3RJZCcsIHsgdW5pcXVlOiBmYWxzZSB9KVxyXG4gICAgICAgICAgICBpbnZlbnRvcnlTdG9yZS5jcmVhdGVJbmRleCgnZXhwaXJ5RGF0ZScsICdleHBpcnlEYXRlJywgeyB1bmlxdWU6IGZhbHNlIH0pXHJcbiAgICAgICAgICAgIGludmVudG9yeVN0b3JlLmNyZWF0ZUluZGV4KCdjYXRlZ29yeScsICdjYXRlZ29yeScsIHsgdW5pcXVlOiBmYWxzZSB9KVxyXG4gICAgICAgICAgfVxyXG5cclxuICAgICAgICAgIC8vIENyZWF0ZSBzZXR0aW5ncyBzdG9yZVxyXG4gICAgICAgICAgaWYgKCFkYi5vYmplY3RTdG9yZU5hbWVzLmNvbnRhaW5zKCdzZXR0aW5ncycpKSB7XHJcbiAgICAgICAgICAgIGRiLmNyZWF0ZU9iamVjdFN0b3JlKCdzZXR0aW5ncycsIHsga2V5UGF0aDogJ2tleScgfSlcclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIE1pZ3JhdGlvbiBmcm9tIHYxIHRvIHYyXHJcbiAgICAgICAgaWYgKG9sZFZlcnNpb24gPCAyKSB7XHJcbiAgICAgICAgICAvLyBBZGQgYmFyY29kZSBpbmRleCBpZiBtaXNzaW5nXHJcbiAgICAgICAgICBpZiAoZGIub2JqZWN0U3RvcmVOYW1lcy5jb250YWlucygncHJvZHVjdHMnKSkge1xyXG4gICAgICAgICAgICBjb25zdCBwcm9kdWN0U3RvcmUgPSB0cmFuc2FjdGlvbi5vYmplY3RTdG9yZSgncHJvZHVjdHMnKVxyXG4gICAgICAgICAgICBpZiAoIXByb2R1Y3RTdG9yZS5pbmRleE5hbWVzLmNvbnRhaW5zKCdiYXJjb2RlJykpIHtcclxuICAgICAgICAgICAgICBwcm9kdWN0U3RvcmUuY3JlYXRlSW5kZXgoJ2JhcmNvZGUnLCAnYmFyY29kZScsIHsgdW5pcXVlOiBmYWxzZSB9KVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBNaWdyYXRpb24gZnJvbSB2MiB0byB2MyAtIEFkZCBzeW5jIHRyYWNraW5nXHJcbiAgICAgICAgaWYgKG9sZFZlcnNpb24gPCAzKSB7XHJcbiAgICAgICAgICAvLyBDcmVhdGUgc3luY19sb2cgc3RvcmUgZm9yIHRyYWNraW5nIGNoYW5nZXNcclxuICAgICAgICAgIGlmICghZGIub2JqZWN0U3RvcmVOYW1lcy5jb250YWlucygnc3luY19sb2cnKSkge1xyXG4gICAgICAgICAgICBjb25zdCBzeW5jU3RvcmUgPSBkYi5jcmVhdGVPYmplY3RTdG9yZSgnc3luY19sb2cnLCB7XHJcbiAgICAgICAgICAgICAga2V5UGF0aDogJ2lkJyxcclxuICAgICAgICAgICAgICBhdXRvSW5jcmVtZW50OiB0cnVlLFxyXG4gICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICBzeW5jU3RvcmUuY3JlYXRlSW5kZXgoJ3RhYmxlJywgJ3RhYmxlJywgeyB1bmlxdWU6IGZhbHNlIH0pXHJcbiAgICAgICAgICAgIHN5bmNTdG9yZS5jcmVhdGVJbmRleCgncmVjb3JkSWQnLCAncmVjb3JkSWQnLCB7IHVuaXF1ZTogZmFsc2UgfSlcclxuICAgICAgICAgICAgc3luY1N0b3JlLmNyZWF0ZUluZGV4KCdzeW5jZWQnLCAnc3luY2VkJywgeyB1bmlxdWU6IGZhbHNlIH0pXHJcbiAgICAgICAgICAgIHN5bmNTdG9yZS5jcmVhdGVJbmRleCgndGltZXN0YW1wJywgJ3RpbWVzdGFtcCcsIHsgdW5pcXVlOiBmYWxzZSB9KVxyXG4gICAgICAgICAgfVxyXG5cclxuICAgICAgICAgIC8vIEFkZCBzeW5jLXJlbGF0ZWQgaW5kZXhlcyB0byBleGlzdGluZyBzdG9yZXNcclxuICAgICAgICAgIGlmIChkYi5vYmplY3RTdG9yZU5hbWVzLmNvbnRhaW5zKCdwcm9kdWN0cycpKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHByb2R1Y3RTdG9yZSA9IHRyYW5zYWN0aW9uLm9iamVjdFN0b3JlKCdwcm9kdWN0cycpXHJcbiAgICAgICAgICAgIGlmICghcHJvZHVjdFN0b3JlLmluZGV4TmFtZXMuY29udGFpbnMoJ3N5bmNlZEF0JykpIHtcclxuICAgICAgICAgICAgICBwcm9kdWN0U3RvcmUuY3JlYXRlSW5kZXgoJ3N5bmNlZEF0JywgJ3N5bmNlZEF0JywgeyB1bmlxdWU6IGZhbHNlIH0pXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgaWYgKCFwcm9kdWN0U3RvcmUuaW5kZXhOYW1lcy5jb250YWlucygnX2RlbGV0ZWQnKSkge1xyXG4gICAgICAgICAgICAgIHByb2R1Y3RTdG9yZS5jcmVhdGVJbmRleCgnX2RlbGV0ZWQnLCAnX2RlbGV0ZWQnLCB7IHVuaXF1ZTogZmFsc2UgfSlcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfVxyXG5cclxuICAgICAgICAgIGlmIChkYi5vYmplY3RTdG9yZU5hbWVzLmNvbnRhaW5zKCdpbnZlbnRvcnknKSkge1xyXG4gICAgICAgICAgICBjb25zdCBpbnZlbnRvcnlTdG9yZSA9IHRyYW5zYWN0aW9uLm9iamVjdFN0b3JlKCdpbnZlbnRvcnknKVxyXG4gICAgICAgICAgICBpZiAoIWludmVudG9yeVN0b3JlLmluZGV4TmFtZXMuY29udGFpbnMoJ3N5bmNlZEF0JykpIHtcclxuICAgICAgICAgICAgICBpbnZlbnRvcnlTdG9yZS5jcmVhdGVJbmRleCgnc3luY2VkQXQnLCAnc3luY2VkQXQnLCB7IHVuaXF1ZTogZmFsc2UgfSlcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBpZiAoIWludmVudG9yeVN0b3JlLmluZGV4TmFtZXMuY29udGFpbnMoJ19kZWxldGVkJykpIHtcclxuICAgICAgICAgICAgICBpbnZlbnRvcnlTdG9yZS5jcmVhdGVJbmRleCgnX2RlbGV0ZWQnLCAnX2RlbGV0ZWQnLCB7IHVuaXF1ZTogZmFsc2UgfSlcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfVxyXG5cclxuICAgICAgICAgIGlmIChkYi5vYmplY3RTdG9yZU5hbWVzLmNvbnRhaW5zKCdzZXR0aW5ncycpKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHNldHRpbmdzU3RvcmUgPSB0cmFuc2FjdGlvbi5vYmplY3RTdG9yZSgnc2V0dGluZ3MnKVxyXG4gICAgICAgICAgICBpZiAoIXNldHRpbmdzU3RvcmUuaW5kZXhOYW1lcy5jb250YWlucygnc3luY2VkQXQnKSkge1xyXG4gICAgICAgICAgICAgIHNldHRpbmdzU3RvcmUuY3JlYXRlSW5kZXgoJ3N5bmNlZEF0JywgJ3N5bmNlZEF0JywgeyB1bmlxdWU6IGZhbHNlIH0pXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAvLyBNaWdyYXRlIGV4aXN0aW5nIGRhdGEgdG8gYWRkIG5ldyBmaWVsZHNcclxuICAgICAgICAgIGNvbnN0IHByb2R1Y3RTdG9yZSA9IHRyYW5zYWN0aW9uLm9iamVjdFN0b3JlKCdwcm9kdWN0cycpXHJcbiAgICAgICAgICBjb25zdCBpbnZlbnRvcnlTdG9yZSA9IHRyYW5zYWN0aW9uLm9iamVjdFN0b3JlKCdpbnZlbnRvcnknKVxyXG5cclxuICAgICAgICAgIC8vIEFkZCB0aW1lc3RhbXBzIHRvIGV4aXN0aW5nIHByb2R1Y3RzXHJcbiAgICAgICAgICBwcm9kdWN0U3RvcmUub3BlbkN1cnNvcigpLm9uc3VjY2VzcyA9IChldmVudCkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBjdXJzb3IgPSBldmVudC50YXJnZXQucmVzdWx0XHJcbiAgICAgICAgICAgIGlmIChjdXJzb3IpIHtcclxuICAgICAgICAgICAgICBjb25zdCBwcm9kdWN0ID0gY3Vyc29yLnZhbHVlXHJcbiAgICAgICAgICAgICAgaWYgKCFwcm9kdWN0LmNyZWF0ZWRBdCkgcHJvZHVjdC5jcmVhdGVkQXQgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKClcclxuICAgICAgICAgICAgICBpZiAoIXByb2R1Y3QudXBkYXRlZEF0KSBwcm9kdWN0LnVwZGF0ZWRBdCA9IHByb2R1Y3QuY3JlYXRlZEF0XHJcbiAgICAgICAgICAgICAgcHJvZHVjdC5zeW5jZWRBdCA9IG51bGxcclxuICAgICAgICAgICAgICBwcm9kdWN0Ll9kZWxldGVkID0gZmFsc2VcclxuICAgICAgICAgICAgICBjdXJzb3IudXBkYXRlKHByb2R1Y3QpXHJcbiAgICAgICAgICAgICAgY3Vyc29yLmNvbnRpbnVlKClcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfVxyXG5cclxuICAgICAgICAgIC8vIEFkZCB0aW1lc3RhbXBzIHRvIGV4aXN0aW5nIGludmVudG9yeSBpdGVtc1xyXG4gICAgICAgICAgaW52ZW50b3J5U3RvcmUub3BlbkN1cnNvcigpLm9uc3VjY2VzcyA9IChldmVudCkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBjdXJzb3IgPSBldmVudC50YXJnZXQucmVzdWx0XHJcbiAgICAgICAgICAgIGlmIChjdXJzb3IpIHtcclxuICAgICAgICAgICAgICBjb25zdCBpdGVtID0gY3Vyc29yLnZhbHVlXHJcbiAgICAgICAgICAgICAgaWYgKCFpdGVtLmFkZGVkQXQpIGl0ZW0uYWRkZWRBdCA9IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKVxyXG4gICAgICAgICAgICAgIGl0ZW0ubGFzdENoZWNrZWRBdCA9IGl0ZW0uYWRkZWRBdFxyXG4gICAgICAgICAgICAgIGl0ZW0ubm90aWZpY2F0aW9uU2VudCA9IGZhbHNlXHJcbiAgICAgICAgICAgICAgaXRlbS5zeW5jZWRBdCA9IG51bGxcclxuICAgICAgICAgICAgICBpdGVtLl9kZWxldGVkID0gZmFsc2VcclxuICAgICAgICAgICAgICBjdXJzb3IudXBkYXRlKGl0ZW0pXHJcbiAgICAgICAgICAgICAgY3Vyc29yLmNvbnRpbnVlKClcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gTWlncmF0aW9uIGZyb20gdjMgdG8gdjQgLSBBZGQgY2F0YWxvZyBzdG9yZXNcclxuICAgICAgICBpZiAob2xkVmVyc2lvbiA8IDQpIHtcclxuICAgICAgICAgIC8vIENyZWF0ZSBwcm9kdWN0c19jYXRhbG9nIHN0b3JlIGZvciBPcGVuIEZvb2QgRmFjdHMgZGF0YVxyXG4gICAgICAgICAgaWYgKCFkYi5vYmplY3RTdG9yZU5hbWVzLmNvbnRhaW5zKCdwcm9kdWN0c19jYXRhbG9nJykpIHtcclxuICAgICAgICAgICAgY29uc3QgY2F0YWxvZ1N0b3JlID0gZGIuY3JlYXRlT2JqZWN0U3RvcmUoJ3Byb2R1Y3RzX2NhdGFsb2cnLCB7XHJcbiAgICAgICAgICAgICAga2V5UGF0aDogJ2lkJyxcclxuICAgICAgICAgICAgICBhdXRvSW5jcmVtZW50OiB0cnVlLFxyXG4gICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICBjYXRhbG9nU3RvcmUuY3JlYXRlSW5kZXgoJ2JhcmNvZGUnLCAnYmFyY29kZScsIHsgdW5pcXVlOiB0cnVlIH0pXHJcbiAgICAgICAgICAgIGNhdGFsb2dTdG9yZS5jcmVhdGVJbmRleCgnbmFtZScsICduYW1lJywgeyB1bmlxdWU6IGZhbHNlIH0pXHJcbiAgICAgICAgICAgIGNhdGFsb2dTdG9yZS5jcmVhdGVJbmRleCgnbm9ybWFsaXplZE5hbWUnLCAnbm9ybWFsaXplZE5hbWUnLCB7IHVuaXF1ZTogZmFsc2UgfSlcclxuICAgICAgICAgICAgY2F0YWxvZ1N0b3JlLmNyZWF0ZUluZGV4KCdjYXRlZ29yeScsICdjYXRlZ29yeScsIHsgdW5pcXVlOiBmYWxzZSB9KVxyXG4gICAgICAgICAgICBjYXRhbG9nU3RvcmUuY3JlYXRlSW5kZXgoJ2JyYW5kJywgJ2JyYW5kJywgeyB1bmlxdWU6IGZhbHNlIH0pXHJcbiAgICAgICAgICAgIGNhdGFsb2dTdG9yZS5jcmVhdGVJbmRleCgnc291cmNlJywgJ3NvdXJjZScsIHsgdW5pcXVlOiBmYWxzZSB9KVxyXG4gICAgICAgICAgICBjYXRhbG9nU3RvcmUuY3JlYXRlSW5kZXgoJ3VwZGF0ZWRBdCcsICd1cGRhdGVkQXQnLCB7IHVuaXF1ZTogZmFsc2UgfSlcclxuICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAvLyBDcmVhdGUgcHJvZHVjdHNfdXNlciBzdG9yZSBmb3IgdXNlci1jdXN0b21pemVkIHRlbXBsYXRlc1xyXG4gICAgICAgICAgaWYgKCFkYi5vYmplY3RTdG9yZU5hbWVzLmNvbnRhaW5zKCdwcm9kdWN0c191c2VyJykpIHtcclxuICAgICAgICAgICAgY29uc3QgdXNlclN0b3JlID0gZGIuY3JlYXRlT2JqZWN0U3RvcmUoJ3Byb2R1Y3RzX3VzZXInLCB7XHJcbiAgICAgICAgICAgICAga2V5UGF0aDogJ2lkJyxcclxuICAgICAgICAgICAgICBhdXRvSW5jcmVtZW50OiB0cnVlLFxyXG4gICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICB1c2VyU3RvcmUuY3JlYXRlSW5kZXgoJ2JhcmNvZGUnLCAnYmFyY29kZScsIHsgdW5pcXVlOiBmYWxzZSB9KVxyXG4gICAgICAgICAgICB1c2VyU3RvcmUuY3JlYXRlSW5kZXgoJ25hbWUnLCAnbmFtZScsIHsgdW5pcXVlOiBmYWxzZSB9KVxyXG4gICAgICAgICAgICB1c2VyU3RvcmUuY3JlYXRlSW5kZXgoJ25vcm1hbGl6ZWROYW1lJywgJ25vcm1hbGl6ZWROYW1lJywgeyB1bmlxdWU6IGZhbHNlIH0pXHJcbiAgICAgICAgICAgIHVzZXJTdG9yZS5jcmVhdGVJbmRleCgnY2F0ZWdvcnknLCAnY2F0ZWdvcnknLCB7IHVuaXF1ZTogZmFsc2UgfSlcclxuICAgICAgICAgICAgdXNlclN0b3JlLmNyZWF0ZUluZGV4KCd1c2FnZUNvdW50JywgJ3VzYWdlQ291bnQnLCB7IHVuaXF1ZTogZmFsc2UgfSlcclxuICAgICAgICAgICAgdXNlclN0b3JlLmNyZWF0ZUluZGV4KCdsYXN0VXNlZEF0JywgJ2xhc3RVc2VkQXQnLCB7IHVuaXF1ZTogZmFsc2UgfSlcclxuICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAvLyBDcmVhdGUgcHJvZHVjdHNfaW5kZXggZm9yIGZhc3Qgc2VhcmNoXHJcbiAgICAgICAgICBpZiAoIWRiLm9iamVjdFN0b3JlTmFtZXMuY29udGFpbnMoJ3Byb2R1Y3RzX2luZGV4JykpIHtcclxuICAgICAgICAgICAgY29uc3QgaW5kZXhTdG9yZSA9IGRiLmNyZWF0ZU9iamVjdFN0b3JlKCdwcm9kdWN0c19pbmRleCcsIHtcclxuICAgICAgICAgICAgICBrZXlQYXRoOiAnaWQnLFxyXG4gICAgICAgICAgICAgIGF1dG9JbmNyZW1lbnQ6IHRydWUsXHJcbiAgICAgICAgICAgIH0pXHJcbiAgICAgICAgICAgIGluZGV4U3RvcmUuY3JlYXRlSW5kZXgoJ3NlYXJjaEtleScsICdzZWFyY2hLZXknLCB7IHVuaXF1ZTogZmFsc2UgfSlcclxuICAgICAgICAgICAgaW5kZXhTdG9yZS5jcmVhdGVJbmRleCgncHJvZHVjdElkJywgJ3Byb2R1Y3RJZCcsIHsgdW5pcXVlOiBmYWxzZSB9KVxyXG4gICAgICAgICAgICBpbmRleFN0b3JlLmNyZWF0ZUluZGV4KCdzb3VyY2VUYWJsZScsICdzb3VyY2VUYWJsZScsIHsgdW5pcXVlOiBmYWxzZSB9KVxyXG4gICAgICAgICAgICBpbmRleFN0b3JlLmNyZWF0ZUluZGV4KCdzY29yZScsICdzY29yZScsIHsgdW5pcXVlOiBmYWxzZSB9KVxyXG4gICAgICAgICAgfVxyXG5cclxuICAgICAgICAgIC8vIENyZWF0ZSBjYXRhbG9nX21ldGFkYXRhIGZvciB2ZXJzaW9uIHRyYWNraW5nXHJcbiAgICAgICAgICBpZiAoIWRiLm9iamVjdFN0b3JlTmFtZXMuY29udGFpbnMoJ2NhdGFsb2dfbWV0YWRhdGEnKSkge1xyXG4gICAgICAgICAgICBkYi5jcmVhdGVPYmplY3RTdG9yZSgnY2F0YWxvZ19tZXRhZGF0YScsIHsga2V5UGF0aDogJ2tleScgfSlcclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIE1pZ3JhdGlvbiBmcm9tIHY0IHRvIHY1IC0gQWRkIGNvbnN1bXB0aW9uIHRyYWNraW5nIGFuZCBzaG9wcGluZyBsaXN0XHJcbiAgICAgICAgaWYgKG9sZFZlcnNpb24gPCA1KSB7XHJcbiAgICAgICAgICAvLyBDcmVhdGUgY29uc3VtcHRpb25fbG9nIHN0b3JlXHJcbiAgICAgICAgICBpZiAoIWRiLm9iamVjdFN0b3JlTmFtZXMuY29udGFpbnMoJ2NvbnN1bXB0aW9uX2xvZycpKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNvbnN1bXB0aW9uU3RvcmUgPSBkYi5jcmVhdGVPYmplY3RTdG9yZSgnY29uc3VtcHRpb25fbG9nJywge1xyXG4gICAgICAgICAgICAgIGtleVBhdGg6ICdpZCcsXHJcbiAgICAgICAgICAgIH0pXHJcbiAgICAgICAgICAgIGNvbnN1bXB0aW9uU3RvcmUuY3JlYXRlSW5kZXgoJ2ludmVudG9yeV9pZCcsICdpbnZlbnRvcnlfaWQnLCB7IHVuaXF1ZTogZmFsc2UgfSlcclxuICAgICAgICAgICAgY29uc3VtcHRpb25TdG9yZS5jcmVhdGVJbmRleCgncHJvZHVjdF9pZCcsICdwcm9kdWN0X2lkJywgeyB1bmlxdWU6IGZhbHNlIH0pXHJcbiAgICAgICAgICAgIGNvbnN1bXB0aW9uU3RvcmUuY3JlYXRlSW5kZXgoJ2NvbnN1bWVkX2F0JywgJ2NvbnN1bWVkX2F0JywgeyB1bmlxdWU6IGZhbHNlIH0pXHJcbiAgICAgICAgICAgIGNvbnN1bXB0aW9uU3RvcmUuY3JlYXRlSW5kZXgoJ2NhdGVnb3J5JywgJ2NhdGVnb3J5JywgeyB1bmlxdWU6IGZhbHNlIH0pXHJcbiAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgLy8gQ3JlYXRlIHNob3BwaW5nX2xpc3Qgc3RvcmVcclxuICAgICAgICAgIGlmICghZGIub2JqZWN0U3RvcmVOYW1lcy5jb250YWlucygnc2hvcHBpbmdfbGlzdCcpKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHNob3BwaW5nU3RvcmUgPSBkYi5jcmVhdGVPYmplY3RTdG9yZSgnc2hvcHBpbmdfbGlzdCcsIHtcclxuICAgICAgICAgICAgICBrZXlQYXRoOiAnaWQnLFxyXG4gICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICBzaG9wcGluZ1N0b3JlLmNyZWF0ZUluZGV4KCdwcm9kdWN0X2lkJywgJ3Byb2R1Y3RfaWQnLCB7IHVuaXF1ZTogZmFsc2UgfSlcclxuICAgICAgICAgICAgc2hvcHBpbmdTdG9yZS5jcmVhdGVJbmRleCgnY2F0ZWdvcnknLCAnY2F0ZWdvcnknLCB7IHVuaXF1ZTogZmFsc2UgfSlcclxuICAgICAgICAgICAgc2hvcHBpbmdTdG9yZS5jcmVhdGVJbmRleCgncHJpb3JpdHknLCAncHJpb3JpdHknLCB7IHVuaXF1ZTogZmFsc2UgfSlcclxuICAgICAgICAgICAgc2hvcHBpbmdTdG9yZS5jcmVhdGVJbmRleCgncHVyY2hhc2VkJywgJ3B1cmNoYXNlZCcsIHsgdW5pcXVlOiBmYWxzZSB9KVxyXG4gICAgICAgICAgICBzaG9wcGluZ1N0b3JlLmNyZWF0ZUluZGV4KCdjcmVhdGVkX2F0JywgJ2NyZWF0ZWRfYXQnLCB7IHVuaXF1ZTogZmFsc2UgfSlcclxuICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAvLyBDcmVhdGUgYWNoaWV2ZW1lbnRzIHN0b3JlXHJcbiAgICAgICAgICBpZiAoIWRiLm9iamVjdFN0b3JlTmFtZXMuY29udGFpbnMoJ2FjaGlldmVtZW50cycpKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGFjaGlldmVtZW50U3RvcmUgPSBkYi5jcmVhdGVPYmplY3RTdG9yZSgnYWNoaWV2ZW1lbnRzJywge1xyXG4gICAgICAgICAgICAgIGtleVBhdGg6ICdpZCcsXHJcbiAgICAgICAgICAgIH0pXHJcbiAgICAgICAgICAgIGFjaGlldmVtZW50U3RvcmUuY3JlYXRlSW5kZXgoJ3VubG9ja2VkX2F0JywgJ3VubG9ja2VkX2F0JywgeyB1bmlxdWU6IGZhbHNlIH0pXHJcbiAgICAgICAgICAgIGFjaGlldmVtZW50U3RvcmUuY3JlYXRlSW5kZXgoJ3R5cGUnLCAndHlwZScsIHsgdW5pcXVlOiBmYWxzZSB9KVxyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gTWlncmF0aW9uIGZyb20gdjUgdG8gdjYgLSBBZGQgYWxlcnRzIHNldHRpbmdzIHN0b3JlXHJcbiAgICAgICAgaWYgKG9sZFZlcnNpb24gPCA2KSB7XHJcbiAgICAgICAgICBpZiAoIWRiLm9iamVjdFN0b3JlTmFtZXMuY29udGFpbnMoJ2FsZXJ0c19zZXR0aW5ncycpKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGFsZXJ0c1N0b3JlID0gZGIuY3JlYXRlT2JqZWN0U3RvcmUoJ2FsZXJ0c19zZXR0aW5ncycsIHsga2V5UGF0aDogJ2lkJyB9KVxyXG4gICAgICAgICAgICBhbGVydHNTdG9yZS5jcmVhdGVJbmRleCgnZW5hYmxlZCcsICdlbmFibGVkJywgeyB1bmlxdWU6IGZhbHNlIH0pXHJcbiAgICAgICAgICAgIGFsZXJ0c1N0b3JlLmNyZWF0ZUluZGV4KCdjaGFubmVsJywgJ2NoYW5uZWwnLCB7IHVuaXF1ZTogZmFsc2UgfSlcclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIE1pZ3JhdGlvbiBmcm9tIHY2IHRvIHY3IC0gQ2F0ZWdvcmllcyBzdG9yZVxyXG4gICAgICAgIGlmIChvbGRWZXJzaW9uIDwgNykge1xyXG4gICAgICAgICAgaWYgKCFkYi5vYmplY3RTdG9yZU5hbWVzLmNvbnRhaW5zKCdjYXRlZ29yaWVzJykpIHtcclxuICAgICAgICAgICAgY29uc3QgY2F0ZWdvcmllc1N0b3JlID0gZGIuY3JlYXRlT2JqZWN0U3RvcmUoJ2NhdGVnb3JpZXMnLCB7XHJcbiAgICAgICAgICAgICAga2V5UGF0aDogJ2lkJyxcclxuICAgICAgICAgICAgICBhdXRvSW5jcmVtZW50OiB0cnVlLFxyXG4gICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICBjYXRlZ29yaWVzU3RvcmUuY3JlYXRlSW5kZXgoJ3NsdWcnLCAnc2x1ZycsIHsgdW5pcXVlOiB0cnVlIH0pXHJcbiAgICAgICAgICAgIGNhdGVnb3JpZXNTdG9yZS5jcmVhdGVJbmRleCgnbm9ybWFsaXplZE5hbWUnLCAnbm9ybWFsaXplZE5hbWUnLCB7IHVuaXF1ZTogdHJ1ZSB9KVxyXG4gICAgICAgICAgICBjYXRlZ29yaWVzU3RvcmUuY3JlYXRlSW5kZXgoJ2FyY2hpdmVkJywgJ2FyY2hpdmVkJywgeyB1bmlxdWU6IGZhbHNlIH0pXHJcblxyXG4gICAgICAgICAgICBERUZBVUxUX0NBVEVHT1JJRVMuZm9yRWFjaCgoY2F0KSA9PiB7XHJcbiAgICAgICAgICAgICAgY2F0ZWdvcmllc1N0b3JlLmFkZCh7XHJcbiAgICAgICAgICAgICAgICAuLi5jYXQsXHJcbiAgICAgICAgICAgICAgICBub3JtYWxpemVkTmFtZTogbm9ybWFsaXplVGV4dChjYXQubmFtZSksXHJcbiAgICAgICAgICAgICAgICBhcmNoaXZlZDogZmFsc2UsXHJcbiAgICAgICAgICAgICAgICBjcmVhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgICAgICAgICAgIHVwZGF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICAgICAgICAgIH0pXHJcbiAgICAgICAgICAgIH0pXHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBNaWdyYXRpb24gZnJvbSB2NyB0byB2OCAtIEFkZCBob3VzZWhvbGRfaWQgc3VwcG9ydFxyXG4gICAgICAgIGlmIChvbGRWZXJzaW9uIDwgOCkge1xyXG4gICAgICAgICAgLy8gQWRkIGhvdXNlaG9sZF9pZCBpbmRleCB0byBpbnZlbnRvcnkgc3RvcmVcclxuICAgICAgICAgIGlmIChkYi5vYmplY3RTdG9yZU5hbWVzLmNvbnRhaW5zKCdpbnZlbnRvcnknKSkge1xyXG4gICAgICAgICAgICBjb25zdCBpbnZlbnRvcnlTdG9yZSA9IHRyYW5zYWN0aW9uLm9iamVjdFN0b3JlKCdpbnZlbnRvcnknKVxyXG4gICAgICAgICAgICBpZiAoIWludmVudG9yeVN0b3JlLmluZGV4TmFtZXMuY29udGFpbnMoJ2hvdXNlaG9sZF9pZCcpKSB7XHJcbiAgICAgICAgICAgICAgaW52ZW50b3J5U3RvcmUuY3JlYXRlSW5kZXgoJ2hvdXNlaG9sZF9pZCcsICdob3VzZWhvbGRfaWQnLCB7IHVuaXF1ZTogZmFsc2UgfSlcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfVxyXG5cclxuICAgICAgICAgIC8vIEFkZCBob3VzZWhvbGRfaWQgaW5kZXggdG8gcHJvZHVjdHNfdXNlciBzdG9yZVxyXG4gICAgICAgICAgaWYgKGRiLm9iamVjdFN0b3JlTmFtZXMuY29udGFpbnMoJ3Byb2R1Y3RzX3VzZXInKSkge1xyXG4gICAgICAgICAgICBjb25zdCB1c2VyU3RvcmUgPSB0cmFuc2FjdGlvbi5vYmplY3RTdG9yZSgncHJvZHVjdHNfdXNlcicpXHJcbiAgICAgICAgICAgIGlmICghdXNlclN0b3JlLmluZGV4TmFtZXMuY29udGFpbnMoJ2hvdXNlaG9sZF9pZCcpKSB7XHJcbiAgICAgICAgICAgICAgdXNlclN0b3JlLmNyZWF0ZUluZGV4KCdob3VzZWhvbGRfaWQnLCAnaG91c2Vob2xkX2lkJywgeyB1bmlxdWU6IGZhbHNlIH0pXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAvLyBBZGQgaG91c2Vob2xkX2lkIGluZGV4IHRvIGNvbnN1bXB0aW9uX2xvZ1xyXG4gICAgICAgICAgaWYgKGRiLm9iamVjdFN0b3JlTmFtZXMuY29udGFpbnMoJ2NvbnN1bXB0aW9uX2xvZycpKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNvbnN1bXB0aW9uU3RvcmUgPSB0cmFuc2FjdGlvbi5vYmplY3RTdG9yZSgnY29uc3VtcHRpb25fbG9nJylcclxuICAgICAgICAgICAgaWYgKCFjb25zdW1wdGlvblN0b3JlLmluZGV4TmFtZXMuY29udGFpbnMoJ2hvdXNlaG9sZF9pZCcpKSB7XHJcbiAgICAgICAgICAgICAgY29uc3VtcHRpb25TdG9yZS5jcmVhdGVJbmRleCgnaG91c2Vob2xkX2lkJywgJ2hvdXNlaG9sZF9pZCcsIHsgdW5pcXVlOiBmYWxzZSB9KVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgLy8gQWRkIGhvdXNlaG9sZF9pZCBpbmRleCB0byBzaG9wcGluZ19saXN0XHJcbiAgICAgICAgICBpZiAoZGIub2JqZWN0U3RvcmVOYW1lcy5jb250YWlucygnc2hvcHBpbmdfbGlzdCcpKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHNob3BwaW5nU3RvcmUgPSB0cmFuc2FjdGlvbi5vYmplY3RTdG9yZSgnc2hvcHBpbmdfbGlzdCcpXHJcbiAgICAgICAgICAgIGlmICghc2hvcHBpbmdTdG9yZS5pbmRleE5hbWVzLmNvbnRhaW5zKCdob3VzZWhvbGRfaWQnKSkge1xyXG4gICAgICAgICAgICAgIHNob3BwaW5nU3RvcmUuY3JlYXRlSW5kZXgoJ2hvdXNlaG9sZF9pZCcsICdob3VzZWhvbGRfaWQnLCB7IHVuaXF1ZTogZmFsc2UgfSlcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfVxyXG5cclxuICAgICAgICAgIC8vIENyZWF0ZSBob3VzZWhvbGRfc2V0dGluZ3Mgc3RvcmUgZm9yIHBlci1ob3VzZWhvbGQgY29uZmlndXJhdGlvblxyXG4gICAgICAgICAgaWYgKCFkYi5vYmplY3RTdG9yZU5hbWVzLmNvbnRhaW5zKCdob3VzZWhvbGRfc2V0dGluZ3MnKSkge1xyXG4gICAgICAgICAgICBjb25zdCBzZXR0aW5nc1N0b3JlID0gZGIuY3JlYXRlT2JqZWN0U3RvcmUoJ2hvdXNlaG9sZF9zZXR0aW5ncycsIHtcclxuICAgICAgICAgICAgICBrZXlQYXRoOiAnaWQnLFxyXG4gICAgICAgICAgICAgIGF1dG9JbmNyZW1lbnQ6IHRydWUsXHJcbiAgICAgICAgICAgIH0pXHJcbiAgICAgICAgICAgIHNldHRpbmdzU3RvcmUuY3JlYXRlSW5kZXgoJ2hvdXNlaG9sZF9pZCcsICdob3VzZWhvbGRfaWQnLCB7IHVuaXF1ZTogdHJ1ZSB9KVxyXG4gICAgICAgICAgICBzZXR0aW5nc1N0b3JlLmNyZWF0ZUluZGV4KCdrZXknLCAna2V5JywgeyB1bmlxdWU6IGZhbHNlIH0pXHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICB9LFxyXG4gICAgfSlcclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIGluaXRpYWxpemUgZGF0YWJhc2U6JywgZXJyb3IpXHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoYERhdGFiYXNlIGluaXRpYWxpemF0aW9uIGZhaWxlZDogJHtlcnJvci5tZXNzYWdlfWApXHJcbiAgfVxyXG59XHJcblxyXG4gXHJcbi8vIE5vcm1hbGl6ZSB0ZXh0IGZvciBtYXRjaGluZyAocmVtb3ZlIHNwZWNpYWwgY2hhcnMsIGxvd2VyY2FzZSwgdHJpbSlcclxuY29uc3Qgbm9ybWFsaXplVGV4dCA9ICh0ZXh0KSA9PiB7XHJcbiAgaWYgKCF0ZXh0KSByZXR1cm4gJydcclxuICByZXR1cm4gdGV4dFxyXG4gICAgLnRvTG93ZXJDYXNlKClcclxuICAgIC5yZXBsYWNlKC9bXmEtejAtOVxcc10vZywgJycpXHJcbiAgICAudHJpbSgpXHJcbiAgICAucmVwbGFjZSgvXFxzKy9nLCAnICcpXHJcbn1cclxuXHJcbmNvbnN0IGNhbm9uaWNhbENhdGVnb3J5U2x1ZyA9IChuYW1lKSA9PiB7XHJcbiAgY29uc3Qgbm9ybWFsaXplZCA9IG5vcm1hbGl6ZVRleHQobmFtZSlcclxuICBpZiAoIW5vcm1hbGl6ZWQpIHJldHVybiAnb3RoZXInXHJcblxyXG4gIGNvbnN0IGxvb2t1cCA9IHtcclxuICAgIGZvb2Q6ICdmb29kJyxcclxuICAgIHdhdGVyOiAnd2F0ZXInLFxyXG4gICAgbWVkczogJ21lZHMnLFxyXG4gICAgbWVkaWNhdGlvbnM6ICdtZWRzJyxcclxuICAgIG1lZGljaW5lOiAnbWVkcycsXHJcbiAgICAnYmF0dGVyaWVzIHBvd2VyJzogJ2JhdHRlcmllc1Bvd2VyJyxcclxuICAgIGJhdHRlcmllczogJ2JhdHRlcmllc1Bvd2VyJyxcclxuICAgIHBvd2VyOiAnYmF0dGVyaWVzUG93ZXInLFxyXG4gICAgaGVhdGluZzogJ2hlYXRpbmcnLFxyXG4gICAgaGVhdDogJ2hlYXRpbmcnLFxyXG4gICAgbGlnaHQ6ICdsaWdodCcsXHJcbiAgICBoeWdpZW5lOiAnaHlnaWVuZScsXHJcbiAgICAnZmlyc3QgYWlkJzogJ2ZpcnN0QWlkJyxcclxuICAgIHRvb2xzOiAndG9vbHMnLFxyXG4gICAgZXF1aXBtZW50OiAndG9vbHMnLFxyXG4gICAgJ3Rvb2xzIGVxdWlwbWVudCc6ICd0b29scycsXHJcbiAgICBvdGhlcjogJ290aGVyJyxcclxuICB9XHJcblxyXG4gIGlmIChsb29rdXBbbm9ybWFsaXplZF0pIHJldHVybiBsb29rdXBbbm9ybWFsaXplZF1cclxuXHJcbiAgLy8gRmFsbGJhY2sgc2x1Zzoga2ViYWItY2FzZSBub3JtYWxpemVkIHRleHRcclxuICByZXR1cm4gbm9ybWFsaXplZC5yZXBsYWNlKC9cXHMrL2csICctJykuc2xpY2UoMCwgNjQpXHJcbn1cclxuXHJcbmNvbnN0IHNhbml0aXplQ2F0ZWdvcnlOYW1lID0gKG5hbWUpID0+IHtcclxuICBpZiAoIW5hbWUpIHJldHVybiAnT3RoZXInXHJcbiAgcmV0dXJuIG5hbWUudHJpbSgpLnJlcGxhY2UoL1xccysvZywgJyAnKS5zbGljZSgwLCA4MClcclxufVxyXG5cclxuLyoqXHJcbiAqIFRyYWNrIGEgY2hhbmdlIGZvciBzeW5jXHJcbiAqIExvZ3Mgb3BlcmF0aW9ucyAoY3JlYXRlLCB1cGRhdGUsIGRlbGV0ZSkgdG8gc3luY19sb2dcclxuICpcclxuICogQHBhcmFtIHtzdHJpbmd9IHRhYmxlIC0gVGFibGUgbmFtZSAocHJvZHVjdHMsIGludmVudG9yeSwgc2V0dGluZ3MpXHJcbiAqIEBwYXJhbSB7bnVtYmVyfHN0cmluZ30gcmVjb3JkSWQgLSBSZWNvcmQgSURcclxuICogQHBhcmFtIHtzdHJpbmd9IG9wZXJhdGlvbiAtIE9wZXJhdGlvbiB0eXBlIChjcmVhdGUsIHVwZGF0ZSwgZGVsZXRlKVxyXG4gKi9cclxuZXhwb3J0IGNvbnN0IHRyYWNrQ2hhbmdlID0gYXN5bmMgKHRhYmxlLCByZWNvcmRJZCwgb3BlcmF0aW9uKSA9PiB7XHJcbiAgdHJ5IHtcclxuICAgIGNvbnN0IGRiID0gYXdhaXQgaW5pdERCKClcclxuICAgIGNvbnN0IHR4ID0gZGIudHJhbnNhY3Rpb24oJ3N5bmNfbG9nJywgJ3JlYWR3cml0ZScpXHJcbiAgICBhd2FpdCB0eC5zdG9yZS5hZGQoe1xyXG4gICAgICB0YWJsZSxcclxuICAgICAgcmVjb3JkSWQsXHJcbiAgICAgIG9wZXJhdGlvbixcclxuICAgICAgdGltZXN0YW1wOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgIHN5bmNlZDogZmFsc2UsXHJcbiAgICB9KVxyXG4gICAgYXdhaXQgdHguZG9uZVxyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gdHJhY2sgY2hhbmdlOicsIGVycm9yKVxyXG4gICAgLy8gRG9uJ3QgdGhyb3cgLSB0cmFja2luZyBmYWlsdXJlIHNob3VsZG4ndCBicmVhayB0aGUgb3BlcmF0aW9uXHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogR2V0IHBlbmRpbmcgY2hhbmdlcyB0aGF0IG5lZWQgdG8gYmUgc3luY2VkXHJcbiAqIEluY2x1ZGVzIHRoZSBhY3R1YWwgZGF0YSBmb3IgZWFjaCBjaGFuZ2VkIHJlY29yZFxyXG4gKlxyXG4gKiBAcmV0dXJucyB7QXJyYXl9IEFycmF5IG9mIHVuc3luY2VkIGNoYW5nZXMgd2l0aCBkYXRhXHJcbiAqL1xyXG5leHBvcnQgY29uc3QgZ2V0UGVuZGluZ0NoYW5nZXMgPSBhc3luYyAoKSA9PiB7XHJcbiAgdHJ5IHtcclxuICAgIGNvbnN0IGRiID0gYXdhaXQgaW5pdERCKClcclxuICAgIGNvbnN0IHR4ID0gZGIudHJhbnNhY3Rpb24oWydzeW5jX2xvZycsICdwcm9kdWN0cycsICdpbnZlbnRvcnknLCAnc2V0dGluZ3MnXSwgJ3JlYWRvbmx5JylcclxuICAgIGNvbnN0IGluZGV4ID0gdHgub2JqZWN0U3RvcmUoJ3N5bmNfbG9nJykuaW5kZXgoJ3N5bmNlZCcpXHJcbiAgICAvLyBJbmRleGVkREIga2V5cyBkbyBub3Qgc3VwcG9ydCBib29sZWFucyBhcyBxdWVyeSB2YWx1ZXMgaW4gYWxsIGJyb3dzZXJzLlxyXG4gICAgLy8gRmV0Y2ggYWxsIGxvZ3MgZnJvbSB0aGUgaW5kZXggYW5kIGZpbHRlciB1bnN5bmNlZCBjaGFuZ2VzIGNsaWVudC1zaWRlLlxyXG4gICAgY29uc3QgYWxsTG9ncyA9IGF3YWl0IGluZGV4LmdldEFsbCgpXHJcbiAgICBjb25zdCBsb2dzID0gYWxsTG9ncy5maWx0ZXIoKGxvZykgPT4gbG9nICYmIGxvZy5zeW5jZWQgPT09IGZhbHNlKVxyXG5cclxuICAgIC8vIEZldGNoIGFjdHVhbCBkYXRhIGZvciBlYWNoIGNoYW5nZVxyXG4gICAgY29uc3QgY2hhbmdlcyA9IFtdXHJcbiAgICBmb3IgKGNvbnN0IGxvZyBvZiBsb2dzKSB7XHJcbiAgICAgIGxldCBkYXRhID0gbnVsbFxyXG5cclxuICAgICAgaWYgKGxvZy5vcGVyYXRpb24gIT09ICdkZWxldGUnKSB7XHJcbiAgICAgICAgY29uc3Qgc3RvcmUgPSB0eC5vYmplY3RTdG9yZShsb2cudGFibGUpXHJcbiAgICAgICAgZGF0YSA9IGF3YWl0IHN0b3JlLmdldChsb2cucmVjb3JkSWQpXHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGNoYW5nZXMucHVzaCh7XHJcbiAgICAgICAgLi4ubG9nLFxyXG4gICAgICAgIGRhdGEsXHJcbiAgICAgIH0pXHJcbiAgICB9XHJcblxyXG4gICAgYXdhaXQgdHguZG9uZVxyXG4gICAgcmV0dXJuIGNoYW5nZXNcclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIGdldCBwZW5kaW5nIGNoYW5nZXM6JywgZXJyb3IpXHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoYEZhaWxlZCB0byByZXRyaWV2ZSBwZW5kaW5nIGNoYW5nZXM6ICR7ZXJyb3IubWVzc2FnZX1gKVxyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIE1hcmsgYSBjaGFuZ2UgYXMgc3luY2VkXHJcbiAqXHJcbiAqIEBwYXJhbSB7c3RyaW5nfSB0YWJsZSAtIFRhYmxlIG5hbWVcclxuICogQHBhcmFtIHtudW1iZXJ8c3RyaW5nfSByZWNvcmRJZCAtIFJlY29yZCBJRFxyXG4gKi9cclxuZXhwb3J0IGNvbnN0IG1hcmtTeW5jZWQgPSBhc3luYyAodGFibGUsIHJlY29yZElkKSA9PiB7XHJcbiAgdHJ5IHtcclxuICAgIGNvbnN0IGRiID0gYXdhaXQgaW5pdERCKClcclxuICAgIGNvbnN0IHR4ID0gZGIudHJhbnNhY3Rpb24oJ3N5bmNfbG9nJywgJ3JlYWR3cml0ZScpXHJcbiAgICBjb25zdCBpbmRleCA9IHR4LnN0b3JlLmluZGV4KCdyZWNvcmRJZCcpXHJcbiAgICBsZXQgY3Vyc29yID0gYXdhaXQgaW5kZXgub3BlbkN1cnNvcihyZWNvcmRJZClcclxuXHJcbiAgICB3aGlsZSAoY3Vyc29yKSB7XHJcbiAgICAgIGlmIChjdXJzb3IudmFsdWUudGFibGUgPT09IHRhYmxlICYmICFjdXJzb3IudmFsdWUuc3luY2VkKSB7XHJcbiAgICAgICAgY29uc3QgcmVjb3JkID0gY3Vyc29yLnZhbHVlXHJcbiAgICAgICAgcmVjb3JkLnN5bmNlZCA9IHRydWVcclxuICAgICAgICByZWNvcmQuc3luY2VkQXQgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKClcclxuICAgICAgICBhd2FpdCBjdXJzb3IudXBkYXRlKHJlY29yZClcclxuICAgICAgfVxyXG4gICAgICBjdXJzb3IgPSBhd2FpdCBjdXJzb3IuY29udGludWUoKVxyXG4gICAgfVxyXG5cclxuICAgIGF3YWl0IHR4LmRvbmVcclxuXHJcbiAgICAvLyBBbHNvIHVwZGF0ZSB0aGUgcmVjb3JkJ3Mgc3luY2VkQXQgdGltZXN0YW1wXHJcbiAgICBjb25zdCByZWNvcmRUeCA9IGRiLnRyYW5zYWN0aW9uKHRhYmxlLCAncmVhZHdyaXRlJylcclxuICAgIGNvbnN0IHJlY29yZFN0b3JlID0gcmVjb3JkVHgub2JqZWN0U3RvcmUodGFibGUpXHJcbiAgICBjb25zdCByZWNvcmQgPSBhd2FpdCByZWNvcmRTdG9yZS5nZXQocmVjb3JkSWQpXHJcbiAgICBpZiAocmVjb3JkKSB7XHJcbiAgICAgIHJlY29yZC5zeW5jZWRBdCA9IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKVxyXG4gICAgICBhd2FpdCByZWNvcmRTdG9yZS5wdXQocmVjb3JkKVxyXG4gICAgfVxyXG4gICAgYXdhaXQgcmVjb3JkVHguZG9uZVxyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gbWFyayBjaGFuZ2UgYXMgc3luY2VkOicsIGVycm9yKVxyXG4gICAgdGhyb3cgbmV3IEVycm9yKGBGYWlsZWQgdG8gbWFyayBjaGFuZ2UgYXMgc3luY2VkOiAke2Vycm9yLm1lc3NhZ2V9YClcclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBDbGVhciBvbGQgc3luY2VkIGxvZ3MgKGhvdXNla2VlcGluZylcclxuICogUmVtb3ZlcyBzeW5jZWQgbG9ncyBvbGRlciB0aGFuIHNwZWNpZmllZCBkYXlzXHJcbiAqXHJcbiAqIEBwYXJhbSB7bnVtYmVyfSBkYXlzVG9LZWVwIC0gTnVtYmVyIG9mIGRheXMgdG8ga2VlcCBzeW5jZWQgbG9ncyAoZGVmYXVsdDogMzApXHJcbiAqL1xyXG5leHBvcnQgY29uc3QgY2xlYXJPbGRTeW5jTG9ncyA9IGFzeW5jIChkYXlzVG9LZWVwID0gMzApID0+IHtcclxuICB0cnkge1xyXG4gICAgY29uc3QgZGIgPSBhd2FpdCBpbml0REIoKVxyXG4gICAgY29uc3QgY3V0b2ZmRGF0ZSA9IG5ldyBEYXRlKClcclxuICAgIGN1dG9mZkRhdGUuc2V0RGF0ZShjdXRvZmZEYXRlLmdldERhdGUoKSAtIGRheXNUb0tlZXApXHJcbiAgICBjb25zdCBjdXRvZmZJU08gPSBjdXRvZmZEYXRlLnRvSVNPU3RyaW5nKClcclxuXHJcbiAgICBjb25zdCB0eCA9IGRiLnRyYW5zYWN0aW9uKCdzeW5jX2xvZycsICdyZWFkd3JpdGUnKVxyXG4gICAgY29uc3QgaW5kZXggPSB0eC5zdG9yZS5pbmRleCgnc3luY2VkJylcclxuICAgIGxldCBjdXJzb3IgPSBhd2FpdCBpbmRleC5vcGVuQ3Vyc29yKHRydWUpIC8vIE9ubHkgc3luY2VkIGl0ZW1zXHJcblxyXG4gICAgbGV0IGRlbGV0ZWQgPSAwXHJcbiAgICB3aGlsZSAoY3Vyc29yKSB7XHJcbiAgICAgIGlmIChjdXJzb3IudmFsdWUuc3luY2VkQXQgJiYgY3Vyc29yLnZhbHVlLnN5bmNlZEF0IDwgY3V0b2ZmSVNPKSB7XHJcbiAgICAgICAgYXdhaXQgY3Vyc29yLmRlbGV0ZSgpXHJcbiAgICAgICAgZGVsZXRlZCsrXHJcbiAgICAgIH1cclxuICAgICAgY3Vyc29yID0gYXdhaXQgY3Vyc29yLmNvbnRpbnVlKClcclxuICAgIH1cclxuXHJcbiAgICBhd2FpdCB0eC5kb25lXHJcbiAgICBjb25zb2xlLmxvZyhgQ2xlYXJlZCAke2RlbGV0ZWR9IG9sZCBzeW5jIGxvZ3NgKVxyXG4gICAgcmV0dXJuIGRlbGV0ZWRcclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIGNsZWFyIG9sZCBzeW5jIGxvZ3M6JywgZXJyb3IpXHJcbiAgfVxyXG59XHJcblxyXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbi8vIENBVEVHT1JZIE9QRVJBVElPTlNcclxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG5cclxuY29uc3QgZW5zdXJlQ2F0ZWdvcmllc1N0b3JlID0gYXN5bmMgKCkgPT4ge1xyXG4gIHRyeSB7XHJcbiAgICBjb25zdCBkYiA9IGF3YWl0IGluaXREQigpXHJcbiAgICBpZiAoIWRiLm9iamVjdFN0b3JlTmFtZXMuY29udGFpbnMoJ2NhdGVnb3JpZXMnKSkge1xyXG4gICAgICBjb25zb2xlLndhcm4oJ0NhdGVnb3JpZXMgc3RvcmUgbWlzc2luZzsgcmV0dXJuaW5nIGRlZmF1bHRzJylcclxuICAgICAgcmV0dXJuIG51bGxcclxuICAgIH1cclxuICAgIHJldHVybiBkYlxyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gZW5zdXJlIGNhdGVnb3JpZXMgc3RvcmU6JywgZXJyb3IpXHJcbiAgICByZXR1cm4gbnVsbFxyXG4gIH1cclxufVxyXG5cclxuZXhwb3J0IGNvbnN0IGdldENhdGVnb3JpZXMgPSBhc3luYyAoeyBpbmNsdWRlQXJjaGl2ZWQgPSBmYWxzZSB9ID0ge30pID0+IHtcclxuICB0cnkge1xyXG4gICAgY29uc3QgZGIgPSBhd2FpdCBlbnN1cmVDYXRlZ29yaWVzU3RvcmUoKVxyXG4gICAgaWYgKCFkYikgcmV0dXJuIERFRkFVTFRfQ0FURUdPUklFU1xyXG5cclxuICAgIGNvbnN0IHR4ID0gZGIudHJhbnNhY3Rpb24oJ2NhdGVnb3JpZXMnLCAncmVhZG9ubHknKVxyXG4gICAgY29uc3QgaXRlbXMgPSBhd2FpdCB0eC5zdG9yZS5nZXRBbGwoKVxyXG4gICAgYXdhaXQgdHguZG9uZVxyXG5cclxuICAgIGNvbnN0IGZpbHRlcmVkID0gaW5jbHVkZUFyY2hpdmVkID8gaXRlbXMgOiBpdGVtcy5maWx0ZXIoKGMpID0+ICFjLmFyY2hpdmVkKVxyXG4gICAgaWYgKCFmaWx0ZXJlZC5sZW5ndGgpIHtcclxuICAgICAgLy8gU2VlZCBkZWZhdWx0cyBpZiBlbXB0eVxyXG4gICAgICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKClcclxuICAgICAgY29uc3Qgc2VlZFR4ID0gZGIudHJhbnNhY3Rpb24oJ2NhdGVnb3JpZXMnLCAncmVhZHdyaXRlJylcclxuICAgICAgZm9yIChjb25zdCBjYXQgb2YgREVGQVVMVF9DQVRFR09SSUVTKSB7XHJcbiAgICAgICAgYXdhaXQgc2VlZFR4LnN0b3JlLmFkZCh7XHJcbiAgICAgICAgICAuLi5jYXQsXHJcbiAgICAgICAgICBub3JtYWxpemVkTmFtZTogbm9ybWFsaXplVGV4dChjYXQubmFtZSksXHJcbiAgICAgICAgICBhcmNoaXZlZDogZmFsc2UsXHJcbiAgICAgICAgICBjcmVhdGVkQXQ6IG5vdyxcclxuICAgICAgICAgIHVwZGF0ZWRBdDogbm93LFxyXG4gICAgICAgIH0pXHJcbiAgICAgIH1cclxuICAgICAgYXdhaXQgc2VlZFR4LmRvbmVcclxuICAgICAgcmV0dXJuIERFRkFVTFRfQ0FURUdPUklFU1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBmaWx0ZXJlZFxyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gbG9hZCBjYXRlZ29yaWVzOicsIGVycm9yKVxyXG4gICAgcmV0dXJuIERFRkFVTFRfQ0FURUdPUklFU1xyXG4gIH1cclxufVxyXG5cclxuZXhwb3J0IGNvbnN0IHVwc2VydENhdGVnb3J5ID0gYXN5bmMgKGlucHV0KSA9PiB7XHJcbiAgY29uc3QgbmFtZSA9IHNhbml0aXplQ2F0ZWdvcnlOYW1lKHR5cGVvZiBpbnB1dCA9PT0gJ3N0cmluZycgPyBpbnB1dCA6IGlucHV0Py5uYW1lKVxyXG4gIGNvbnN0IHNsdWdGcm9tSW5wdXQgPSB0eXBlb2YgaW5wdXQgPT09ICdvYmplY3QnICYmIGlucHV0Py5zbHVnID8gaW5wdXQuc2x1ZyA6IG51bGxcclxuICBjb25zdCBzbHVnID0gc2x1Z0Zyb21JbnB1dCB8fCBjYW5vbmljYWxDYXRlZ29yeVNsdWcobmFtZSlcclxuICBjb25zdCBub3JtYWxpemVkTmFtZSA9IG5vcm1hbGl6ZVRleHQobmFtZSlcclxuXHJcbiAgdHJ5IHtcclxuICAgIGNvbnN0IGRiID0gYXdhaXQgZW5zdXJlQ2F0ZWdvcmllc1N0b3JlKClcclxuICAgIGlmICghZGIpIHtcclxuICAgICAgY29uc3QgZmFsbGJhY2sgPSBERUZBVUxUX0NBVEVHT1JJRVMuZmluZCgoYykgPT4gYy5zbHVnID09PSBzbHVnKVxyXG4gICAgICByZXR1cm4gZmFsbGJhY2sgfHwgeyBpZDogbnVsbCwgc2x1ZywgbmFtZSB9XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgdHggPSBkYi50cmFuc2FjdGlvbignY2F0ZWdvcmllcycsICdyZWFkd3JpdGUnKVxyXG4gICAgY29uc3Qgbm9ybWFsaXplZEluZGV4ID0gdHguc3RvcmUuaW5kZXgoJ25vcm1hbGl6ZWROYW1lJylcclxuICAgIGNvbnN0IGV4aXN0aW5nID0gYXdhaXQgbm9ybWFsaXplZEluZGV4LmdldChub3JtYWxpemVkTmFtZSlcclxuXHJcbiAgICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKClcclxuICAgIGlmIChleGlzdGluZykge1xyXG4gICAgICBjb25zdCB1cGRhdGVkID0ge1xyXG4gICAgICAgIC4uLmV4aXN0aW5nLFxyXG4gICAgICAgIG5hbWUsXHJcbiAgICAgICAgc2x1ZyxcclxuICAgICAgICBub3JtYWxpemVkTmFtZSxcclxuICAgICAgICBhcmNoaXZlZDogZmFsc2UsXHJcbiAgICAgICAgdXBkYXRlZEF0OiBub3csXHJcbiAgICAgIH1cclxuICAgICAgYXdhaXQgdHguc3RvcmUucHV0KHVwZGF0ZWQpXHJcbiAgICAgIGF3YWl0IHR4LmRvbmVcclxuICAgICAgcmV0dXJuIHVwZGF0ZWRcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBpZCA9IGF3YWl0IHR4LnN0b3JlLmFkZCh7XHJcbiAgICAgIG5hbWUsXHJcbiAgICAgIHNsdWcsXHJcbiAgICAgIG5vcm1hbGl6ZWROYW1lLFxyXG4gICAgICBhcmNoaXZlZDogZmFsc2UsXHJcbiAgICAgIGNyZWF0ZWRBdDogbm93LFxyXG4gICAgICB1cGRhdGVkQXQ6IG5vdyxcclxuICAgIH0pXHJcbiAgICBhd2FpdCB0eC5kb25lXHJcblxyXG4gICAgcmV0dXJuIHsgaWQsIG5hbWUsIHNsdWcsIG5vcm1hbGl6ZWROYW1lLCBhcmNoaXZlZDogZmFsc2UsIGNyZWF0ZWRBdDogbm93LCB1cGRhdGVkQXQ6IG5vdyB9XHJcbiAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byB1cHNlcnQgY2F0ZWdvcnk6JywgZXJyb3IpXHJcbiAgICByZXR1cm4geyBpZDogbnVsbCwgbmFtZSwgc2x1ZyB9XHJcbiAgfVxyXG59XHJcblxyXG5jb25zdCB1cGRhdGVDYXRlZ29yeVNsdWdJblN0b3JlID0gYXN5bmMgKGRiLCBzdG9yZU5hbWUsIHNvdXJjZVNsdWcsIHRhcmdldFNsdWcpID0+IHtcclxuICBpZiAoIWRiLm9iamVjdFN0b3JlTmFtZXMuY29udGFpbnMoc3RvcmVOYW1lKSkgcmV0dXJuXHJcblxyXG4gIGNvbnN0IHR4ID0gZGIudHJhbnNhY3Rpb24oc3RvcmVOYW1lLCAncmVhZHdyaXRlJylcclxuICBsZXQgY3Vyc29yID0gYXdhaXQgdHguc3RvcmUub3BlbkN1cnNvcigpXHJcbiAgd2hpbGUgKGN1cnNvcikge1xyXG4gICAgY29uc3QgdmFsdWUgPSBjdXJzb3IudmFsdWVcclxuICAgIGlmICh2YWx1ZS5jYXRlZ29yeSA9PT0gc291cmNlU2x1Zykge1xyXG4gICAgICB2YWx1ZS5jYXRlZ29yeSA9IHRhcmdldFNsdWdcclxuICAgICAgYXdhaXQgY3Vyc29yLnVwZGF0ZSh2YWx1ZSlcclxuICAgIH1cclxuICAgIGN1cnNvciA9IGF3YWl0IGN1cnNvci5jb250aW51ZSgpXHJcbiAgfVxyXG4gIGF3YWl0IHR4LmRvbmVcclxufVxyXG5cclxuZXhwb3J0IGNvbnN0IG1lcmdlQ2F0ZWdvcmllcyA9IGFzeW5jICh0YXJnZXRTbHVnLCBzb3VyY2VTbHVncyA9IFtdKSA9PiB7XHJcbiAgY29uc3QgdW5pcXVlU291cmNlcyA9IFsuLi5uZXcgU2V0KHNvdXJjZVNsdWdzKV0uZmlsdGVyKChzKSA9PiBzICYmIHMgIT09IHRhcmdldFNsdWcpXHJcbiAgaWYgKCF0YXJnZXRTbHVnIHx8IHVuaXF1ZVNvdXJjZXMubGVuZ3RoID09PSAwKSByZXR1cm4geyB1cGRhdGVkOiAwIH1cclxuXHJcbiAgdHJ5IHtcclxuICAgIGNvbnN0IGRiID0gYXdhaXQgZW5zdXJlQ2F0ZWdvcmllc1N0b3JlKClcclxuICAgIGlmICghZGIpIHJldHVybiB7IHVwZGF0ZWQ6IDAgfVxyXG5cclxuICAgIGNvbnN0IHR4ID0gZGIudHJhbnNhY3Rpb24oJ2NhdGVnb3JpZXMnLCAncmVhZHdyaXRlJylcclxuICAgIGNvbnN0IHNsdWdJbmRleCA9IHR4LnN0b3JlLmluZGV4KCdzbHVnJylcclxuICAgIGNvbnN0IHRhcmdldCA9IGF3YWl0IHNsdWdJbmRleC5nZXQodGFyZ2V0U2x1ZylcclxuXHJcbiAgICBpZiAoIXRhcmdldCkge1xyXG4gICAgICBhd2FpdCB0eC5kb25lXHJcbiAgICAgIHRocm93IG5ldyBFcnJvcihgVGFyZ2V0IGNhdGVnb3J5ICR7dGFyZ2V0U2x1Z30gbm90IGZvdW5kYClcclxuICAgIH1cclxuXHJcbiAgICBhd2FpdCB0eC5kb25lXHJcblxyXG4gICAgY29uc3Qgc3RvcmVzVG9VcGRhdGUgPSBbXHJcbiAgICAgICdwcm9kdWN0cycsXHJcbiAgICAgICdpbnZlbnRvcnknLFxyXG4gICAgICAnc2hvcHBpbmdfbGlzdCcsXHJcbiAgICAgICdjb25zdW1wdGlvbl9sb2cnLFxyXG4gICAgICAncHJvZHVjdHNfdXNlcicsXHJcbiAgICAgICdwcm9kdWN0c19jYXRhbG9nJyxcclxuICAgIF1cclxuXHJcbiAgICBsZXQgdXBkYXRlcyA9IDBcclxuICAgIGZvciAoY29uc3Qgc291cmNlU2x1ZyBvZiB1bmlxdWVTb3VyY2VzKSB7XHJcbiAgICAgIGZvciAoY29uc3Qgc3RvcmUgb2Ygc3RvcmVzVG9VcGRhdGUpIHtcclxuICAgICAgICBhd2FpdCB1cGRhdGVDYXRlZ29yeVNsdWdJblN0b3JlKGRiLCBzdG9yZSwgc291cmNlU2x1ZywgdGFyZ2V0U2x1ZylcclxuICAgICAgfVxyXG5cclxuICAgICAgY29uc3QgYXJjaGl2ZVR4ID0gZGIudHJhbnNhY3Rpb24oJ2NhdGVnb3JpZXMnLCAncmVhZHdyaXRlJylcclxuICAgICAgY29uc3QgaWR4ID0gYXJjaGl2ZVR4LnN0b3JlLmluZGV4KCdzbHVnJylcclxuICAgICAgY29uc3Qgc291cmNlUmVjb3JkID0gYXdhaXQgaWR4LmdldChzb3VyY2VTbHVnKVxyXG4gICAgICBpZiAoc291cmNlUmVjb3JkKSB7XHJcbiAgICAgICAgc291cmNlUmVjb3JkLmFyY2hpdmVkID0gdHJ1ZVxyXG4gICAgICAgIHNvdXJjZVJlY29yZC51cGRhdGVkQXQgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKClcclxuICAgICAgICBhd2FpdCBhcmNoaXZlVHguc3RvcmUucHV0KHNvdXJjZVJlY29yZClcclxuICAgICAgICB1cGRhdGVzKytcclxuICAgICAgfVxyXG4gICAgICBhd2FpdCBhcmNoaXZlVHguZG9uZVxyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiB7IHVwZGF0ZWQ6IHVwZGF0ZXMgfVxyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gbWVyZ2UgY2F0ZWdvcmllczonLCBlcnJvcilcclxuICAgIHJldHVybiB7IHVwZGF0ZWQ6IDAsIGVycm9yOiBlcnJvci5tZXNzYWdlIH1cclxuICB9XHJcbn1cclxuXHJcbmV4cG9ydCBjb25zdCBnZXRDYXRlZ29yeVVzYWdlQ291bnRzID0gYXN5bmMgKCkgPT4ge1xyXG4gIGNvbnN0IGNvdW50cyA9IHt9XHJcbiAgdHJ5IHtcclxuICAgIGNvbnN0IGRiID0gYXdhaXQgaW5pdERCKClcclxuICAgIGNvbnN0IGFkZENvdW50ID0gKHNsdWcpID0+IHtcclxuICAgICAgaWYgKCFzbHVnKSByZXR1cm5cclxuICAgICAgY291bnRzW3NsdWddID0gY291bnRzW3NsdWddID8gY291bnRzW3NsdWddICsgMSA6IDFcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBpbnZlbnRvcnkgPSBhd2FpdCBkYi5nZXRBbGwoJ2ludmVudG9yeScpXHJcbiAgICBpbnZlbnRvcnkuZm9yRWFjaCgoaXRlbSkgPT4gYWRkQ291bnQoaXRlbS5jYXRlZ29yeSkpXHJcblxyXG4gICAgY29uc3QgcHJvZHVjdHMgPSBhd2FpdCBkYi5nZXRBbGwoJ3Byb2R1Y3RzJylcclxuICAgIHByb2R1Y3RzLmZvckVhY2goKHApID0+IGFkZENvdW50KHAuY2F0ZWdvcnkpKVxyXG5cclxuICAgIGlmIChkYi5vYmplY3RTdG9yZU5hbWVzLmNvbnRhaW5zKCdzaG9wcGluZ19saXN0JykpIHtcclxuICAgICAgY29uc3Qgc2hvcHBpbmcgPSBhd2FpdCBkYi5nZXRBbGwoJ3Nob3BwaW5nX2xpc3QnKVxyXG4gICAgICBzaG9wcGluZy5mb3JFYWNoKChpdGVtKSA9PiBhZGRDb3VudChpdGVtLmNhdGVnb3J5KSlcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gY291bnRzXHJcbiAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byBjb21wdXRlIGNhdGVnb3J5IHVzYWdlIGNvdW50czonLCBlcnJvcilcclxuICAgIHJldHVybiBjb3VudHNcclxuICB9XHJcbn1cclxuXHJcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuLy8gUFJPRFVDVCBPUEVSQVRJT05TXHJcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuXHJcbi8qKlxyXG4gKiBBZGQgYSBuZXcgcHJvZHVjdFxyXG4gKiBAcGFyYW0ge09iamVjdH0gcHJvZHVjdCAtIFByb2R1Y3QgZGF0YVxyXG4gKiBAcmV0dXJucyB7bnVtYmVyfSBQcm9kdWN0IElEXHJcbiAqL1xyXG5leHBvcnQgY29uc3QgYWRkUHJvZHVjdCA9IGFzeW5jIChwcm9kdWN0KSA9PiB7XHJcbiAgdHJ5IHtcclxuICAgIGNvbnN0IGRiID0gYXdhaXQgaW5pdERCKClcclxuICAgIGNvbnN0IG5vcm1hbGl6ZWROYW1lID0gbm9ybWFsaXplVGV4dChwcm9kdWN0Lm5hbWUpXHJcbiAgICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKClcclxuXHJcbiAgICBjb25zdCBwcm9kdWN0RGF0YSA9IHtcclxuICAgICAgLi4ucHJvZHVjdCxcclxuICAgICAgbm9ybWFsaXplZE5hbWUsXHJcbiAgICAgIGNyZWF0ZWRBdDogbm93LFxyXG4gICAgICB1cGRhdGVkQXQ6IG5vdyxcclxuICAgICAgc3luY2VkQXQ6IG51bGwsXHJcbiAgICAgIF9kZWxldGVkOiBmYWxzZSxcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCB0eCA9IGRiLnRyYW5zYWN0aW9uKCdwcm9kdWN0cycsICdyZWFkd3JpdGUnKVxyXG4gICAgY29uc3QgaWQgPSBhd2FpdCB0eC5zdG9yZS5hZGQocHJvZHVjdERhdGEpXHJcbiAgICBhd2FpdCB0eC5kb25lXHJcblxyXG4gICAgLy8gVHJhY2sgY2hhbmdlIGZvciBzeW5jXHJcbiAgICBhd2FpdCB0cmFja0NoYW5nZSgncHJvZHVjdHMnLCBpZCwgJ2NyZWF0ZScpXHJcblxyXG4gICAgcmV0dXJuIGlkXHJcbiAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byBhZGQgcHJvZHVjdDonLCBlcnJvcilcclxuICAgIHRocm93IG5ldyBFcnJvcihgRmFpbGVkIHRvIGFkZCBwcm9kdWN0OiAke2Vycm9yLm1lc3NhZ2V9YClcclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBHZXQgYWxsIHByb2R1Y3RzIChleGNsdWRpbmcgZGVsZXRlZClcclxuICogQHBhcmFtIHtib29sZWFufSBpbmNsdWRlRGVsZXRlZCAtIEluY2x1ZGUgc29mdC1kZWxldGVkIHByb2R1Y3RzXHJcbiAqIEByZXR1cm5zIHtBcnJheX0gQXJyYXkgb2YgcHJvZHVjdHNcclxuICovXHJcbmV4cG9ydCBjb25zdCBnZXRQcm9kdWN0cyA9IGFzeW5jIChpbmNsdWRlRGVsZXRlZCA9IGZhbHNlKSA9PiB7XHJcbiAgdHJ5IHtcclxuICAgIGNvbnN0IGRiID0gYXdhaXQgaW5pdERCKClcclxuICAgIGNvbnN0IHByb2R1Y3RzID0gYXdhaXQgZGIuZ2V0QWxsKCdwcm9kdWN0cycpXHJcblxyXG4gICAgaWYgKGluY2x1ZGVEZWxldGVkKSB7XHJcbiAgICAgIHJldHVybiBwcm9kdWN0c1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBwcm9kdWN0cy5maWx0ZXIoKHApID0+ICFwLl9kZWxldGVkKVxyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gZ2V0IHByb2R1Y3RzOicsIGVycm9yKVxyXG4gICAgdGhyb3cgbmV3IEVycm9yKGBGYWlsZWQgdG8gcmV0cmlldmUgcHJvZHVjdHM6ICR7ZXJyb3IubWVzc2FnZX1gKVxyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIEdldCBwcm9kdWN0IGJ5IElEXHJcbiAqIEBwYXJhbSB7bnVtYmVyfSBpZCAtIFByb2R1Y3QgSURcclxuICogQHJldHVybnMge09iamVjdHxudWxsfSBQcm9kdWN0IG9yIG51bGwgaWYgbm90IGZvdW5kXHJcbiAqL1xyXG5leHBvcnQgY29uc3QgZ2V0UHJvZHVjdEJ5SWQgPSBhc3luYyAoaWQpID0+IHtcclxuICB0cnkge1xyXG4gICAgY29uc3QgZGIgPSBhd2FpdCBpbml0REIoKVxyXG4gICAgY29uc3QgcHJvZHVjdCA9IGF3YWl0IGRiLmdldCgncHJvZHVjdHMnLCBpZClcclxuICAgIHJldHVybiBwcm9kdWN0ICYmICFwcm9kdWN0Ll9kZWxldGVkID8gcHJvZHVjdCA6IG51bGxcclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIGdldCBwcm9kdWN0OicsIGVycm9yKVxyXG4gICAgdGhyb3cgbmV3IEVycm9yKGBGYWlsZWQgdG8gcmV0cmlldmUgcHJvZHVjdDogJHtlcnJvci5tZXNzYWdlfWApXHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogR2V0IHByb2R1Y3QgYnkgYmFyY29kZVxyXG4gKiBAcGFyYW0ge3N0cmluZ30gYmFyY29kZSAtIFByb2R1Y3QgYmFyY29kZVxyXG4gKiBAcmV0dXJucyB7T2JqZWN0fG51bGx9IFByb2R1Y3Qgb3IgbnVsbCBpZiBub3QgZm91bmRcclxuICovXHJcbmV4cG9ydCBjb25zdCBnZXRQcm9kdWN0QnlCYXJjb2RlID0gYXN5bmMgKGJhcmNvZGUpID0+IHtcclxuICB0cnkge1xyXG4gICAgY29uc3QgZGIgPSBhd2FpdCBpbml0REIoKVxyXG4gICAgY29uc3QgdHggPSBkYi50cmFuc2FjdGlvbigncHJvZHVjdHMnLCAncmVhZG9ubHknKVxyXG4gICAgY29uc3QgaW5kZXggPSB0eC5zdG9yZS5pbmRleCgnYmFyY29kZScpXHJcbiAgICBjb25zdCBwcm9kdWN0ID0gYXdhaXQgaW5kZXguZ2V0KGJhcmNvZGUpXHJcbiAgICBhd2FpdCB0eC5kb25lXHJcbiAgICByZXR1cm4gcHJvZHVjdCAmJiAhcHJvZHVjdC5fZGVsZXRlZCA/IHByb2R1Y3QgOiBudWxsXHJcbiAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byBnZXQgcHJvZHVjdCBieSBiYXJjb2RlOicsIGVycm9yKVxyXG4gICAgcmV0dXJuIG51bGxcclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBGaW5kIHByb2R1Y3QgYnkgbmFtZSAoZnV6enkgbWF0Y2hpbmcpXHJcbiAqIEBwYXJhbSB7c3RyaW5nfSBzY2FubmVkVGV4dCAtIFRleHQgdG8gc2VhcmNoIGZvclxyXG4gKiBAcmV0dXJucyB7T2JqZWN0fG51bGx9IE1hdGNoaW5nIHByb2R1Y3Qgb3IgbnVsbFxyXG4gKi9cclxuZXhwb3J0IGNvbnN0IGZpbmRQcm9kdWN0QnlOYW1lID0gYXN5bmMgKHNjYW5uZWRUZXh0KSA9PiB7XHJcbiAgdHJ5IHtcclxuICAgIGNvbnN0IGRiID0gYXdhaXQgaW5pdERCKClcclxuICAgIGNvbnN0IG5vcm1hbGl6ZWQgPSBub3JtYWxpemVUZXh0KHNjYW5uZWRUZXh0KVxyXG4gICAgY29uc3QgcHJvZHVjdHMgPSBhd2FpdCBkYi5nZXRBbGwoJ3Byb2R1Y3RzJylcclxuXHJcbiAgICAvLyBGaW5kIGV4YWN0IG9yIHBhcnRpYWwgbWF0Y2ggKGV4Y2x1ZGluZyBkZWxldGVkKVxyXG4gICAgcmV0dXJuIHByb2R1Y3RzLmZpbmQoKHApID0+IHtcclxuICAgICAgaWYgKHAuX2RlbGV0ZWQpIHJldHVybiBmYWxzZVxyXG4gICAgICBjb25zdCBwcm9kdWN0Tm9ybWFsaXplZCA9IHAubm9ybWFsaXplZE5hbWVcclxuICAgICAgcmV0dXJuIHByb2R1Y3ROb3JtYWxpemVkLmluY2x1ZGVzKG5vcm1hbGl6ZWQpIHx8IG5vcm1hbGl6ZWQuaW5jbHVkZXMocHJvZHVjdE5vcm1hbGl6ZWQpXHJcbiAgICB9KVxyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gZmluZCBwcm9kdWN0OicsIGVycm9yKVxyXG4gICAgcmV0dXJuIG51bGxcclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBVcGRhdGUgcHJvZHVjdFxyXG4gKiBAcGFyYW0ge251bWJlcn0gaWQgLSBQcm9kdWN0IElEXHJcbiAqIEBwYXJhbSB7T2JqZWN0fSB1cGRhdGVzIC0gRmllbGRzIHRvIHVwZGF0ZVxyXG4gKi9cclxuZXhwb3J0IGNvbnN0IHVwZGF0ZVByb2R1Y3QgPSBhc3luYyAoaWQsIHVwZGF0ZXMpID0+IHtcclxuICB0cnkge1xyXG4gICAgY29uc3QgZGIgPSBhd2FpdCBpbml0REIoKVxyXG4gICAgY29uc3QgdHggPSBkYi50cmFuc2FjdGlvbigncHJvZHVjdHMnLCAncmVhZHdyaXRlJylcclxuICAgIGNvbnN0IHByb2R1Y3QgPSBhd2FpdCB0eC5zdG9yZS5nZXQoaWQpXHJcblxyXG4gICAgaWYgKCFwcm9kdWN0KSB7XHJcbiAgICAgIHRocm93IG5ldyBFcnJvcihgUHJvZHVjdCB3aXRoIElEICR7aWR9IG5vdCBmb3VuZGApXHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgdXBkYXRlZFByb2R1Y3QgPSB7XHJcbiAgICAgIC4uLnByb2R1Y3QsXHJcbiAgICAgIC4uLnVwZGF0ZXMsXHJcbiAgICAgIHVwZGF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICBzeW5jZWRBdDogbnVsbCwgLy8gTWFyayBhcyBuZWVkaW5nIHN5bmNcclxuICAgIH1cclxuXHJcbiAgICAvLyBVcGRhdGUgbm9ybWFsaXplZE5hbWUgaWYgbmFtZSBjaGFuZ2VkXHJcbiAgICBpZiAodXBkYXRlcy5uYW1lICYmIHVwZGF0ZXMubmFtZSAhPT0gcHJvZHVjdC5uYW1lKSB7XHJcbiAgICAgIHVwZGF0ZWRQcm9kdWN0Lm5vcm1hbGl6ZWROYW1lID0gbm9ybWFsaXplVGV4dCh1cGRhdGVzLm5hbWUpXHJcbiAgICB9XHJcblxyXG4gICAgYXdhaXQgdHguc3RvcmUucHV0KHVwZGF0ZWRQcm9kdWN0KVxyXG4gICAgYXdhaXQgdHguZG9uZVxyXG5cclxuICAgIC8vIFRyYWNrIGNoYW5nZSBmb3Igc3luY1xyXG4gICAgYXdhaXQgdHJhY2tDaGFuZ2UoJ3Byb2R1Y3RzJywgaWQsICd1cGRhdGUnKVxyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gdXBkYXRlIHByb2R1Y3Q6JywgZXJyb3IpXHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoYEZhaWxlZCB0byB1cGRhdGUgcHJvZHVjdDogJHtlcnJvci5tZXNzYWdlfWApXHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogRGVsZXRlIHByb2R1Y3QgKHNvZnQgZGVsZXRlKVxyXG4gKiBAcGFyYW0ge251bWJlcn0gaWQgLSBQcm9kdWN0IElEXHJcbiAqIEBwYXJhbSB7Ym9vbGVhbn0gaGFyZCAtIFBlcm1hbmVudGx5IGRlbGV0ZSAoZGVmYXVsdDogZmFsc2UpXHJcbiAqL1xyXG5leHBvcnQgY29uc3QgZGVsZXRlUHJvZHVjdCA9IGFzeW5jIChpZCwgaGFyZCA9IGZhbHNlKSA9PiB7XHJcbiAgdHJ5IHtcclxuICAgIGNvbnN0IGRiID0gYXdhaXQgaW5pdERCKClcclxuICAgIGNvbnN0IHR4ID0gZGIudHJhbnNhY3Rpb24oJ3Byb2R1Y3RzJywgJ3JlYWR3cml0ZScpXHJcblxyXG4gICAgaWYgKGhhcmQpIHtcclxuICAgICAgYXdhaXQgdHguc3RvcmUuZGVsZXRlKGlkKVxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgY29uc3QgcHJvZHVjdCA9IGF3YWl0IHR4LnN0b3JlLmdldChpZClcclxuICAgICAgaWYgKHByb2R1Y3QpIHtcclxuICAgICAgICBwcm9kdWN0Ll9kZWxldGVkID0gdHJ1ZVxyXG4gICAgICAgIHByb2R1Y3QudXBkYXRlZEF0ID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpXHJcbiAgICAgICAgcHJvZHVjdC5zeW5jZWRBdCA9IG51bGxcclxuICAgICAgICBhd2FpdCB0eC5zdG9yZS5wdXQocHJvZHVjdClcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGF3YWl0IHR4LmRvbmVcclxuXHJcbiAgICAvLyBUcmFjayBjaGFuZ2UgZm9yIHN5bmNcclxuICAgIGF3YWl0IHRyYWNrQ2hhbmdlKCdwcm9kdWN0cycsIGlkLCAnZGVsZXRlJylcclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIGRlbGV0ZSBwcm9kdWN0OicsIGVycm9yKVxyXG4gICAgdGhyb3cgbmV3IEVycm9yKGBGYWlsZWQgdG8gZGVsZXRlIHByb2R1Y3Q6ICR7ZXJyb3IubWVzc2FnZX1gKVxyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIFVwc2VydCBwcm9kdWN0IChpbnNlcnQgb3IgdXBkYXRlKVxyXG4gKiBVc2VkIGJ5IHN5bmMgZW5naW5lIHRvIG1lcmdlIHJlbW90ZSBkYXRhXHJcbiAqIEBwYXJhbSB7T2JqZWN0fSBwcm9kdWN0IC0gUHJvZHVjdCBkYXRhIHdpdGggaWRcclxuICovXHJcbmV4cG9ydCBjb25zdCB1cHNlcnRQcm9kdWN0ID0gYXN5bmMgKHByb2R1Y3QpID0+IHtcclxuICB0cnkge1xyXG4gICAgY29uc3QgZGIgPSBhd2FpdCBpbml0REIoKVxyXG4gICAgY29uc3QgdHggPSBkYi50cmFuc2FjdGlvbigncHJvZHVjdHMnLCAncmVhZHdyaXRlJylcclxuXHJcbiAgICAvLyBBdHRlbXB0IHRvIGZpbmQgYW4gZXhpc3RpbmcgcHJvZHVjdCBieSBiYXJjb2RlIGZpcnN0IHRvIGF2b2lkXHJcbiAgICAvLyBjcmVhdGluZyBkdXBsaWNhdGVzIHdoZW4gc3luY2luZyByZW1vdGUgcmVjb3JkcyB0aGF0IHVzZSBkaWZmZXJlbnQgaWRzLlxyXG4gICAgbGV0IGV4aXN0aW5nID0gbnVsbFxyXG4gICAgdHJ5IHtcclxuICAgICAgaWYgKHByb2R1Y3QuYmFyY29kZSkge1xyXG4gICAgICAgIGV4aXN0aW5nID0gYXdhaXQgdHguc3RvcmUuaW5kZXgoJ2JhcmNvZGUnKS5nZXQocHJvZHVjdC5iYXJjb2RlKVxyXG4gICAgICB9XHJcbiAgICB9IGNhdGNoIChfZXJyKSB7XHJcbiAgICAgIC8vIEluZGV4IG1pZ2h0IG5vdCBleGlzdCBpbiBvbGRlciBEQiB2ZXJzaW9ucyAtIGlnbm9yZSBhbmQgY29udGludWVcclxuICAgICAgZXhpc3RpbmcgPSBudWxsXHJcbiAgICB9XHJcblxyXG4gICAgLy8gSWYgbm8gbWF0Y2ggYnkgYmFyY29kZSwgdHJ5IG1hdGNoaW5nIGJ5IHByb3ZpZGVkIGlkXHJcbiAgICBpZiAoIWV4aXN0aW5nICYmIHByb2R1Y3QuaWQpIHtcclxuICAgICAgZXhpc3RpbmcgPSBhd2FpdCB0eC5zdG9yZS5nZXQocHJvZHVjdC5pZClcclxuICAgIH1cclxuXHJcbiAgICBsZXQgcHJvZHVjdERhdGFcclxuICAgIGlmIChleGlzdGluZykge1xyXG4gICAgICAvLyBNZXJnZSByZWNvcmRzIC0gcHJlZmVyIHRoZSBtb3N0IHJlY2VudGx5IHVwZGF0ZWRcclxuICAgICAgY29uc3QgZXhpc3RpbmdUaW1lID0gbmV3IERhdGUoZXhpc3RpbmcudXBkYXRlZF9hdCB8fCBleGlzdGluZy51cGRhdGVkQXQgfHwgMClcclxuICAgICAgY29uc3QgcmVtb3RlVGltZSA9IG5ldyBEYXRlKHByb2R1Y3QudXBkYXRlZF9hdCB8fCBwcm9kdWN0LnVwZGF0ZWRBdCB8fCAwKVxyXG5cclxuICAgICAgcHJvZHVjdERhdGEgPVxyXG4gICAgICAgIHJlbW90ZVRpbWUgPj0gZXhpc3RpbmdUaW1lID8geyAuLi5leGlzdGluZywgLi4ucHJvZHVjdCB9IDogeyAuLi5wcm9kdWN0LCAuLi5leGlzdGluZyB9XHJcblxyXG4gICAgICAvLyBFbnN1cmUgd2Uga2VlcCB0aGUgbG9jYWwgbnVtZXJpYyBpZCB3aGVuIHByZXNlbnRcclxuICAgICAgaWYgKGV4aXN0aW5nLmlkICE9PSB1bmRlZmluZWQpIHByb2R1Y3REYXRhLmlkID0gZXhpc3RpbmcuaWRcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIHByb2R1Y3REYXRhID0geyAuLi5wcm9kdWN0IH1cclxuICAgIH1cclxuXHJcbiAgICAvLyBFbnN1cmUgbm9ybWFsaXplZCBuYW1lXHJcbiAgICBpZiAocHJvZHVjdERhdGEubmFtZSAmJiAhcHJvZHVjdERhdGEubm9ybWFsaXplZE5hbWUpIHtcclxuICAgICAgcHJvZHVjdERhdGEubm9ybWFsaXplZE5hbWUgPSBub3JtYWxpemVUZXh0KHByb2R1Y3REYXRhLm5hbWUpXHJcbiAgICB9XHJcblxyXG4gICAgLy8gUHV0IHdpbGwgaW5zZXJ0IG9yIHVwZGF0ZSB1c2luZyB0aGUga2V5UGF0aDsgcHJlZmVyIHB1dCBzbyBwcm92aWRlZCBpZHMgKFVVSURzKVxyXG4gICAgLy8gZnJvbSByZW1vdGUgYXJlIHByZXNlcnZlZCB3aGVuIG5lZWRlZCwgYnV0IGlmIHdlIG1hdGNoZWQgYW4gZXhpc3RpbmcgcmVjb3JkXHJcbiAgICAvLyB0aGUgZXhpc3RpbmcgbnVtZXJpYyBpZCB3aWxsIGJlIHVzZWQuXHJcbiAgICBhd2FpdCB0eC5zdG9yZS5wdXQocHJvZHVjdERhdGEpXHJcbiAgICBhd2FpdCB0eC5kb25lXHJcblxyXG4gICAgcmV0dXJuIHByb2R1Y3REYXRhLmlkXHJcbiAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byB1cHNlcnQgcHJvZHVjdDonLCBlcnJvcilcclxuICAgIHRocm93IG5ldyBFcnJvcihgRmFpbGVkIHRvIHVwc2VydCBwcm9kdWN0OiAke2Vycm9yLm1lc3NhZ2V9YClcclxuICB9XHJcbn1cclxuXHJcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuLy8gSU5WRU5UT1JZIE9QRVJBVElPTlNcclxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG5cclxuLyoqXHJcbiAqIEFkZCBpbnZlbnRvcnkgaXRlbVxyXG4gKiBAcGFyYW0ge09iamVjdH0gaXRlbSAtIEludmVudG9yeSBpdGVtIGRhdGFcclxuICogQHJldHVybnMge251bWJlcn0gSW52ZW50b3J5IElEXHJcbiAqL1xyXG5leHBvcnQgY29uc3QgYWRkSW52ZW50b3J5SXRlbSA9IGFzeW5jIChpdGVtLCBob3VzZWhvbGRJZCkgPT4ge1xyXG4gIHRyeSB7XHJcbiAgICBpZiAoIWhvdXNlaG9sZElkKSB7XHJcbiAgICAgIHRocm93IG5ldyBFcnJvcignSG91c2Vob2xkIElEIGlzIHJlcXVpcmVkIHRvIGFkZCBpbnZlbnRvcnkgaXRlbXMnKVxyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IGRiID0gYXdhaXQgaW5pdERCKClcclxuICAgIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKVxyXG5cclxuICAgIGNvbnN0IGl0ZW1EYXRhID0ge1xyXG4gICAgICAuLi5pdGVtLFxyXG4gICAgICBob3VzZWhvbGRfaWQ6IGhvdXNlaG9sZElkLFxyXG4gICAgICBhZGRlZEF0OiBub3csXHJcbiAgICAgIGxhc3RDaGVja2VkQXQ6IG5vdyxcclxuICAgICAgbm90aWZpY2F0aW9uU2VudDogZmFsc2UsXHJcbiAgICAgIHN5bmNlZEF0OiBudWxsLFxyXG4gICAgICBfZGVsZXRlZDogZmFsc2UsXHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgdHggPSBkYi50cmFuc2FjdGlvbignaW52ZW50b3J5JywgJ3JlYWR3cml0ZScpXHJcbiAgICBjb25zdCBpZCA9IGF3YWl0IHR4LnN0b3JlLmFkZChpdGVtRGF0YSlcclxuICAgIGF3YWl0IHR4LmRvbmVcclxuXHJcbiAgICAvLyBUcmFjayBjaGFuZ2UgZm9yIHN5bmNcclxuICAgIGF3YWl0IHRyYWNrQ2hhbmdlKCdpbnZlbnRvcnknLCBpZCwgJ2NyZWF0ZScpXHJcblxyXG4gICAgcmV0dXJuIGlkXHJcbiAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byBhZGQgaW52ZW50b3J5IGl0ZW06JywgZXJyb3IpXHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoYEZhaWxlZCB0byBhZGQgaW52ZW50b3J5IGl0ZW06ICR7ZXJyb3IubWVzc2FnZX1gKVxyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIEdldCBhbGwgaW52ZW50b3J5IGl0ZW1zIGZvciBhIGhvdXNlaG9sZCAoZXhjbHVkaW5nIGRlbGV0ZWQpXHJcbiAqIEBwYXJhbSB7c3RyaW5nfSBob3VzZWhvbGRJZCAtIEhvdXNlaG9sZCBJRFxyXG4gKiBAcGFyYW0ge2Jvb2xlYW59IGluY2x1ZGVEZWxldGVkIC0gSW5jbHVkZSBzb2Z0LWRlbGV0ZWQgaXRlbXNcclxuICogQHJldHVybnMge0FycmF5fSBBcnJheSBvZiBpbnZlbnRvcnkgaXRlbXNcclxuICovXHJcbmV4cG9ydCBjb25zdCBnZXRJbnZlbnRvcnkgPSBhc3luYyAoaG91c2Vob2xkSWQsIGluY2x1ZGVEZWxldGVkID0gZmFsc2UpID0+IHtcclxuICB0cnkge1xyXG4gICAgaWYgKCFob3VzZWhvbGRJZCkge1xyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0hvdXNlaG9sZCBJRCBpcyByZXF1aXJlZCB0byByZXRyaWV2ZSBpbnZlbnRvcnknKVxyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IGRiID0gYXdhaXQgaW5pdERCKClcclxuICAgIGNvbnN0IGl0ZW1zID0gYXdhaXQgZGIuZ2V0QWxsRnJvbUluZGV4KCdpbnZlbnRvcnknLCAnaG91c2Vob2xkX2lkJywgaG91c2Vob2xkSWQpXHJcblxyXG4gICAgaWYgKGluY2x1ZGVEZWxldGVkKSB7XHJcbiAgICAgIHJldHVybiBpdGVtc1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBpdGVtcy5maWx0ZXIoKGl0ZW0pID0+ICFpdGVtLl9kZWxldGVkKVxyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gZ2V0IGludmVudG9yeTonLCBlcnJvcilcclxuICAgIHRocm93IG5ldyBFcnJvcihgRmFpbGVkIHRvIHJldHJpZXZlIGludmVudG9yeTogJHtlcnJvci5tZXNzYWdlfWApXHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogR2V0IGludmVudG9yeSBpdGVtcyBieSBwcm9kdWN0IElEXHJcbiAqIEBwYXJhbSB7bnVtYmVyfSBwcm9kdWN0SWQgLSBQcm9kdWN0IElEXHJcbiAqIEByZXR1cm5zIHtBcnJheX0gQXJyYXkgb2YgaW52ZW50b3J5IGl0ZW1zXHJcbiAqL1xyXG5leHBvcnQgY29uc3QgZ2V0SW52ZW50b3J5QnlQcm9kdWN0ID0gYXN5bmMgKHByb2R1Y3RJZCkgPT4ge1xyXG4gIHRyeSB7XHJcbiAgICBjb25zdCBkYiA9IGF3YWl0IGluaXREQigpXHJcbiAgICBjb25zdCBpdGVtcyA9IGF3YWl0IGRiLmdldEFsbEZyb21JbmRleCgnaW52ZW50b3J5JywgJ3Byb2R1Y3RJZCcsIHByb2R1Y3RJZClcclxuICAgIHJldHVybiBpdGVtcy5maWx0ZXIoKGl0ZW0pID0+ICFpdGVtLl9kZWxldGVkKVxyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gZ2V0IGludmVudG9yeSBieSBwcm9kdWN0OicsIGVycm9yKVxyXG4gICAgdGhyb3cgbmV3IEVycm9yKGBGYWlsZWQgdG8gcmV0cmlldmUgaW52ZW50b3J5OiAke2Vycm9yLm1lc3NhZ2V9YClcclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBHZXQgZW5yaWNoZWQgaW52ZW50b3J5IGl0ZW1zIChpbnZlbnRvcnkgKyBwcm9kdWN0IGRhdGEpIGZvciBhIGhvdXNlaG9sZFxyXG4gKiBNZXJnZXMgaW52ZW50b3J5IGl0ZW1zIHdpdGggdGhlaXIgY29ycmVzcG9uZGluZyBwcm9kdWN0IHRlbXBsYXRlc1xyXG4gKiB0byBpbmNsdWRlIGltYWdlcyBhbmQgb3RoZXIgcHJvZHVjdCBtZXRhZGF0YVxyXG4gKiBAcGFyYW0ge3N0cmluZ30gaG91c2Vob2xkSWQgLSBIb3VzZWhvbGQgSURcclxuICogQHBhcmFtIHtib29sZWFufSBpbmNsdWRlRGVsZXRlZCAtIEluY2x1ZGUgc29mdC1kZWxldGVkIGl0ZW1zXHJcbiAqIEByZXR1cm5zIHtBcnJheX0gQXJyYXkgb2YgZW5yaWNoZWQgaW52ZW50b3J5IGl0ZW1zXHJcbiAqL1xyXG5leHBvcnQgY29uc3QgZ2V0RW5yaWNoZWRJbnZlbnRvcnkgPSBhc3luYyAoaG91c2Vob2xkSWQsIGluY2x1ZGVEZWxldGVkID0gZmFsc2UpID0+IHtcclxuICB0cnkge1xyXG4gICAgaWYgKCFob3VzZWhvbGRJZCkge1xyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0hvdXNlaG9sZCBJRCBpcyByZXF1aXJlZCB0byByZXRyaWV2ZSBpbnZlbnRvcnknKVxyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IGRiID0gYXdhaXQgaW5pdERCKClcclxuXHJcbiAgICAvLyBHZXQgYWxsIGludmVudG9yeSBpdGVtcyBmb3IgaG91c2Vob2xkXHJcbiAgICBjb25zdCBpbnZlbnRvcnlJdGVtcyA9IGF3YWl0IGRiLmdldEFsbEZyb21JbmRleCgnaW52ZW50b3J5JywgJ2hvdXNlaG9sZF9pZCcsIGhvdXNlaG9sZElkKVxyXG4gICAgY29uc3QgZmlsdGVyZWRJbnZlbnRvcnkgPSBpbmNsdWRlRGVsZXRlZFxyXG4gICAgICA/IGludmVudG9yeUl0ZW1zXHJcbiAgICAgIDogaW52ZW50b3J5SXRlbXMuZmlsdGVyKChpdGVtKSA9PiAhaXRlbS5fZGVsZXRlZClcclxuXHJcbiAgICAvLyBHZXQgYWxsIHByb2R1Y3RzIGZvciBsb29rdXBcclxuICAgIGNvbnN0IHByb2R1Y3RzID0gYXdhaXQgZGIuZ2V0QWxsKCdwcm9kdWN0cycpXHJcbiAgICBjb25zdCBwcm9kdWN0TWFwID0gbmV3IE1hcChwcm9kdWN0cy5tYXAoKHApID0+IFtwLmlkLCBwXSkpXHJcblxyXG4gICAgLy8gRW5yaWNoIGludmVudG9yeSBpdGVtcyB3aXRoIHByb2R1Y3QgZGF0YVxyXG4gICAgcmV0dXJuIGZpbHRlcmVkSW52ZW50b3J5Lm1hcCgoaXRlbSkgPT4ge1xyXG4gICAgICBjb25zdCBwcm9kdWN0ID0gaXRlbS5wcm9kdWN0SWQgPyBwcm9kdWN0TWFwLmdldChpdGVtLnByb2R1Y3RJZCkgOiBudWxsXHJcblxyXG4gICAgICByZXR1cm4ge1xyXG4gICAgICAgIC4uLml0ZW0sXHJcbiAgICAgICAgLy8gRW5yaWNoIHdpdGggcHJvZHVjdCBkYXRhIGlmIGF2YWlsYWJsZVxyXG4gICAgICAgIGltYWdlVXJsOiBwcm9kdWN0Py5pbWFnZVVybCB8fCBpdGVtLmltYWdlVXJsIHx8IG51bGwsXHJcbiAgICAgICAgaW1hZ2VCbG9iOiBwcm9kdWN0Py5pbWFnZUJsb2IgfHwgaXRlbS5pbWFnZUJsb2IgfHwgbnVsbCxcclxuICAgICAgICBicmFuZDogcHJvZHVjdD8uYnJhbmQgfHwgaXRlbS5icmFuZCB8fCBudWxsLFxyXG4gICAgICAgIGJhcmNvZGU6IHByb2R1Y3Q/LmJhcmNvZGUgfHwgaXRlbS5iYXJjb2RlIHx8IG51bGwsXHJcbiAgICAgICAgYWxsZXJnZW5zOiBwcm9kdWN0Py5hbGxlcmdlbnMgfHwgaXRlbS5hbGxlcmdlbnMgfHwgbnVsbCxcclxuICAgICAgICBudXRyaXRpb246IHByb2R1Y3Q/Lm51dHJpdGlvbiB8fCBpdGVtLm51dHJpdGlvbiB8fCBudWxsLFxyXG4gICAgICAgIGluZ3JlZGllbnRzOiBwcm9kdWN0Py5pbmdyZWRpZW50cyB8fCBpdGVtLmluZ3JlZGllbnRzIHx8IG51bGwsXHJcbiAgICAgICAgLy8gS2VlcCBvcmlnaW5hbCBpbnZlbnRvcnkgZGF0YSBhcyBwcmltYXJ5XHJcbiAgICAgICAgcHJvZHVjdFRlbXBsYXRlOiBwcm9kdWN0IHx8IG51bGwsXHJcbiAgICAgIH1cclxuICAgIH0pXHJcbiAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byBnZXQgZW5yaWNoZWQgaW52ZW50b3J5OicsIGVycm9yKVxyXG4gICAgdGhyb3cgbmV3IEVycm9yKGBGYWlsZWQgdG8gcmV0cmlldmUgZW5yaWNoZWQgaW52ZW50b3J5OiAke2Vycm9yLm1lc3NhZ2V9YClcclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBVcGRhdGUgaW52ZW50b3J5IGl0ZW1cclxuICogQHBhcmFtIHtudW1iZXJ9IGlkIC0gSW52ZW50b3J5IElEXHJcbiAqIEBwYXJhbSB7T2JqZWN0fSB1cGRhdGVzIC0gRmllbGRzIHRvIHVwZGF0ZVxyXG4gKi9cclxuZXhwb3J0IGNvbnN0IHVwZGF0ZUludmVudG9yeUl0ZW0gPSBhc3luYyAoaWQsIHVwZGF0ZXMpID0+IHtcclxuICB0cnkge1xyXG4gICAgY29uc3QgZGIgPSBhd2FpdCBpbml0REIoKVxyXG4gICAgY29uc3QgdHggPSBkYi50cmFuc2FjdGlvbignaW52ZW50b3J5JywgJ3JlYWR3cml0ZScpXHJcbiAgICBjb25zdCBpdGVtID0gYXdhaXQgdHguc3RvcmUuZ2V0KGlkKVxyXG5cclxuICAgIGlmICghaXRlbSkge1xyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYEludmVudG9yeSBpdGVtIHdpdGggSUQgJHtpZH0gbm90IGZvdW5kYClcclxuICAgIH1cclxuXHJcbiAgICAvLyBMaWdodHdlaWdodCBwcmUtd3JpdGUgY2hlY2s6IGlmIGNsb3VkIGNvbmZpZ3VyZWQgYW5kIGF1dGhlbnRpY2F0ZWQsXHJcbiAgICAvLyBmZXRjaCByZW1vdGUncyB1cGRhdGVkX2F0IGFuZCBpZiBpdCdzIG5ld2VyIHRoYW4gbG9jYWwgc3luY2VkQXQsIGFib3J0IHdpdGggY29uZmxpY3QuXHJcbiAgICB0cnkge1xyXG4gICAgICBpZiAoaXNOaG9zdENvbmZpZ3VyZWQoKSAmJiBpc05ob3N0QXV0aGVudGljYXRlZCgpKSB7XHJcbiAgICAgICAgY29uc3QgcmVtb3RlID0gYXdhaXQgZ2V0SW52ZW50b3J5QnlJZChpZClcclxuICAgICAgICBpZiAocmVtb3RlICYmIHJlbW90ZS51cGRhdGVkX2F0ICYmIGl0ZW0uc3luY2VkQXQgJiYgbmV3IERhdGUocmVtb3RlLnVwZGF0ZWRfYXQpID4gbmV3IERhdGUoaXRlbS5zeW5jZWRBdCkpIHtcclxuICAgICAgICAgIGNvbnN0IGVyciA9IG5ldyBFcnJvcignQ29uZmxpY3Q6IHJlbW90ZSB2ZXJzaW9uIGlzIG5ld2VyIHRoYW4gbG9jYWwgY29weScpXHJcbiAgICAgICAgICBlcnIuY29kZSA9ICdjb25mbGljdCdcclxuICAgICAgICAgIHRocm93IGVyclxyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfSBjYXRjaCAocHJlY2hlY2tFcnIpIHtcclxuICAgICAgLy8gSWYgcHJlY2hlY2sgdGhyb3dzIGEgY29uZmxpY3QgZXJyb3IsIGJ1YmJsZSB1cC4gT3RoZXJ3aXNlIGxvZyBhbmQgY29udGludWUuXHJcbiAgICAgIGlmIChwcmVjaGVja0VyciAmJiBwcmVjaGVja0Vyci5jb2RlID09PSAnY29uZmxpY3QnKSB0aHJvdyBwcmVjaGVja0VyclxyXG4gICAgICBjb25zb2xlLndhcm4oJ1ByZS13cml0ZSByZW1vdGUgY2hlY2sgZmFpbGVkOyBwcm9jZWVkaW5nIHdpdGggbG9jYWwgdXBkYXRlOicsIHByZWNoZWNrRXJyLm1lc3NhZ2UpXHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgdXBkYXRlZEl0ZW0gPSB7XHJcbiAgICAgIC4uLml0ZW0sXHJcbiAgICAgIC4uLnVwZGF0ZXMsXHJcbiAgICAgIGxhc3RDaGVja2VkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgc3luY2VkQXQ6IG51bGwsIC8vIE1hcmsgYXMgbmVlZGluZyBzeW5jXHJcbiAgICB9XHJcblxyXG4gICAgYXdhaXQgdHguc3RvcmUucHV0KHVwZGF0ZWRJdGVtKVxyXG4gICAgYXdhaXQgdHguZG9uZVxyXG5cclxuICAgIC8vIFRyYWNrIGNoYW5nZSBmb3Igc3luY1xyXG4gICAgYXdhaXQgdHJhY2tDaGFuZ2UoJ2ludmVudG9yeScsIGlkLCAndXBkYXRlJylcclxuICAgIC8vIFRyaWdnZXIgYmFja2dyb3VuZCBzeW5jIChiZXN0LWVmZm9ydClcclxuICAgIHRyeSB7XHJcbiAgICAgIHN5bmNUb0Nsb3VkKCkuY2F0Y2goKGUpID0+IGNvbnNvbGUud2FybignQmFja2dyb3VuZCBzeW5jIGZhaWxlZDonLCBlLm1lc3NhZ2UgfHwgZSkpXHJcbiAgICB9IGNhdGNoIChlKSB7XHJcbiAgICAgIGNvbnNvbGUud2FybignRmFpbGVkIHRvIHRyaWdnZXIgYmFja2dyb3VuZCBzeW5jOicsIGUubWVzc2FnZSB8fCBlKVxyXG4gICAgfVxyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gdXBkYXRlIGludmVudG9yeSBpdGVtOicsIGVycm9yKVxyXG4gICAgdGhyb3cgbmV3IEVycm9yKGBGYWlsZWQgdG8gdXBkYXRlIGludmVudG9yeSBpdGVtOiAke2Vycm9yLm1lc3NhZ2V9YClcclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBTeW5jIHBlbmRpbmcgbG9jYWwgY2hhbmdlcyB0byB0aGUgY2xvdWQgdmlhIEdyYXBoUUxcclxuICogLSBDdXJyZW50bHkgaGFuZGxlcyBpbnZlbnRvcnkgY3JlYXRlL3VwZGF0ZS9kZWxldGUgaW4gYmF0Y2hlc1xyXG4gKi9cclxuZXhwb3J0IGNvbnN0IHN5bmNUb0Nsb3VkID0gYXN5bmMgKCkgPT4ge1xyXG4gIHRyeSB7XHJcbiAgICBpZiAoIWlzTmhvc3RDb25maWd1cmVkKCkgfHwgIWlzTmhvc3RBdXRoZW50aWNhdGVkKCkpIHtcclxuICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIHJlYXNvbjogJ05vdCBjb25maWd1cmVkIG9yIG5vdCBhdXRoZW50aWNhdGVkJyB9XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgcGVuZGluZyA9IGF3YWl0IGdldFBlbmRpbmdDaGFuZ2VzKClcclxuICAgIGlmICghcGVuZGluZyB8fCBwZW5kaW5nLmxlbmd0aCA9PT0gMCkgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgc3luY2VkOiAwIH1cclxuXHJcbiAgICAvLyBHcm91cCBpbnZlbnRvcnkgY2hhbmdlc1xyXG4gICAgY29uc3QgaW52ZW50b3J5VXBzZXJ0cyA9IFtdXHJcbiAgICBjb25zdCBpbnZlbnRvcnlEZWxldGVzID0gW11cclxuXHJcbiAgICBmb3IgKGNvbnN0IGNoYW5nZSBvZiBwZW5kaW5nKSB7XHJcbiAgICAgIGlmIChjaGFuZ2UudGFibGUgIT09ICdpbnZlbnRvcnknKSBjb250aW51ZVxyXG5cclxuICAgICAgaWYgKGNoYW5nZS5vcGVyYXRpb24gPT09ICdkZWxldGUnKSB7XHJcbiAgICAgICAgaW52ZW50b3J5RGVsZXRlcy5wdXNoKGNoYW5nZS5yZWNvcmRJZClcclxuICAgICAgfSBlbHNlIGlmIChjaGFuZ2UuZGF0YSkge1xyXG4gICAgICAgIC8vIE1hcCBsb2NhbCBkYXRhIHRvIGEgc2VydmVyLWZyaWVuZGx5IHNoYXBlLiBTZXJ2ZXIgc2NoZW1hIG1heSBuZWVkIHRvIGFjY2VwdCB0aGVzZSBmaWVsZHMuXHJcbiAgICAgICAgY29uc3Qgb2JqID0ge1xyXG4gICAgICAgICAgaWQ6IGNoYW5nZS5kYXRhLmlkLFxyXG4gICAgICAgICAgaG91c2Vob2xkX2lkOiBjaGFuZ2UuZGF0YS5ob3VzZWhvbGRfaWQsXHJcbiAgICAgICAgICBwcm9kdWN0X2lkOiBjaGFuZ2UuZGF0YS5wcm9kdWN0SWQgfHwgbnVsbCxcclxuICAgICAgICAgIHF1YW50aXR5OiBjaGFuZ2UuZGF0YS5xdWFudGl0eSB8fCBudWxsLFxyXG4gICAgICAgICAgZXhwaXJ5X2RhdGU6IGNoYW5nZS5kYXRhLmV4cGlyeURhdGUgfHwgbnVsbCxcclxuICAgICAgICAgIGFkZGVkX2F0OiBjaGFuZ2UuZGF0YS5hZGRlZEF0IHx8IG51bGwsXHJcbiAgICAgICAgICBfZGVsZXRlZDogISFjaGFuZ2UuZGF0YS5fZGVsZXRlZCxcclxuICAgICAgICAgIGFsbG93R3JhY2VQZXJpb2Q6ICEhY2hhbmdlLmRhdGEuYWxsb3dHcmFjZVBlcmlvZCxcclxuICAgICAgICAgIGdyYWNlUGVyaW9kTW9udGhzOiBjaGFuZ2UuZGF0YS5ncmFjZVBlcmlvZE1vbnRocyB8fCBudWxsLFxyXG4gICAgICAgICAgaW1hZ2VVcmw6IGNoYW5nZS5kYXRhLmltYWdlVXJsIHx8IG51bGwsXHJcbiAgICAgICAgfVxyXG4gICAgICAgIGludmVudG9yeVVwc2VydHMucHVzaChvYmopXHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBsZXQgc3luY2VkQ291bnQgPSAwXHJcblxyXG4gICAgLy8gU2VuZCB1cHNlcnRzIChzYWZlOiBtYXJrIG9ubHkgcmV0dXJuZWQgaWRzIGFzIHN5bmNlZClcclxuICAgIGlmIChpbnZlbnRvcnlVcHNlcnRzLmxlbmd0aCA+IDApIHtcclxuICAgICAgdHJ5IHtcclxuICAgICAgICBjb25zdCByZXMgPSBhd2FpdCB1cHNlcnRJbnZlbnRvcnlCYXRjaChpbnZlbnRvcnlVcHNlcnRzKVxyXG4gICAgICAgIGNvbnN0IHJldHVybmVkSWRzID0gKHJlcyB8fCBbXSkubWFwKChyKSA9PiByLmlkKS5maWx0ZXIoQm9vbGVhbilcclxuICAgICAgICBzeW5jZWRDb3VudCArPSByZXR1cm5lZElkcy5sZW5ndGhcclxuICAgICAgICAvLyBNYXJrIGxvY2FsIGxvZ3MgYXMgc3luY2VkIG9ubHkgZm9yIHJldHVybmVkIGlkc1xyXG4gICAgICAgIGZvciAoY29uc3QgaWQgb2YgcmV0dXJuZWRJZHMpIHtcclxuICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIGF3YWl0IG1hcmtTeW5jZWQoJ2ludmVudG9yeScsIGlkKVxyXG4gICAgICAgICAgfSBjYXRjaCAoZSkge1xyXG4gICAgICAgICAgICBjb25zb2xlLndhcm4oJ0ZhaWxlZCB0byBtYXJrIHVwc2VydGVkIHJlY29yZCBhcyBzeW5jZWQ6JywgaWQsIGUubWVzc2FnZSB8fCBlKVxyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICAvLyBJZiBzb21lIHJlcXVlc3RlZCBJRHMgZGlkIG5vdCByZXR1cm4sIGxvZyBmb3IgaW5zcGVjdGlvblxyXG4gICAgICAgIGlmIChyZXR1cm5lZElkcy5sZW5ndGggPCBpbnZlbnRvcnlVcHNlcnRzLmxlbmd0aCkge1xyXG4gICAgICAgICAgY29uc29sZS53YXJuKGBbU1lOQ10gUGFydGlhbCB1cHNlcnQ6IHJlcXVlc3RlZD0ke2ludmVudG9yeVVwc2VydHMubGVuZ3RofSByZXR1cm5lZD0ke3JldHVybmVkSWRzLmxlbmd0aH1gKVxyXG4gICAgICAgIH1cclxuICAgICAgfSBjYXRjaCAodXBFcnIpIHtcclxuICAgICAgICBjb25zb2xlLmVycm9yKCdbU1lOQ10gdXBzZXJ0SW52ZW50b3J5QmF0Y2ggZmFpbGVkLCBsZWF2aW5nIGNoYW5nZXMgdW5zeW5jZWQ6JywgdXBFcnIpXHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyBTZW5kIGRlbGV0ZXNcclxuICAgIGlmIChpbnZlbnRvcnlEZWxldGVzLmxlbmd0aCA+IDApIHtcclxuICAgICAgdHJ5IHtcclxuICAgICAgICBjb25zdCBkZWxSZXMgPSBhd2FpdCBkZWxldGVJbnZlbnRvcnlCYXRjaChpbnZlbnRvcnlEZWxldGVzKVxyXG4gICAgICAgIGNvbnN0IGFmZmVjdGVkID0gZGVsUmVzPy5hZmZlY3RlZF9yb3dzIHx8IDBcclxuICAgICAgICAvLyBJZiBkZWxldGUgcmVwb3J0cyBhZmZlY3RlZCByb3dzIGVxdWFsIHRvIHJlcXVlc3RlZCwgbWFyayBhcyBzeW5jZWRcclxuICAgICAgICBpZiAoYWZmZWN0ZWQgPiAwKSB7XHJcbiAgICAgICAgICBmb3IgKGNvbnN0IGlkIG9mIGludmVudG9yeURlbGV0ZXMpIHtcclxuICAgICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgICBhd2FpdCBtYXJrU3luY2VkKCdpbnZlbnRvcnknLCBpZClcclxuICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xyXG4gICAgICAgICAgICAgIGNvbnNvbGUud2FybignRmFpbGVkIHRvIG1hcmsgZGVsZXRlZCByZWNvcmQgYXMgc3luY2VkOicsIGlkLCBlLm1lc3NhZ2UgfHwgZSlcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgc3luY2VkQ291bnQgKz0gYWZmZWN0ZWRcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgY29uc29sZS53YXJuKCdbU1lOQ10gZGVsZXRlSW52ZW50b3J5QmF0Y2ggcmVwb3J0ZWQgMCBhZmZlY3RlZCByb3dzJylcclxuICAgICAgICB9XHJcbiAgICAgIH0gY2F0Y2ggKGRlbEVycikge1xyXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ1tTWU5DXSBkZWxldGVJbnZlbnRvcnlCYXRjaCBmYWlsZWQsIGxlYXZpbmcgZGVsZXRlcyB1bnN5bmNlZDonLCBkZWxFcnIpXHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyBVcGRhdGUgbGFzdCBzeW5jIHNldHRpbmcgKGdsb2JhbCkgb25seSBpZiB3ZSBzeW5jZWQgc29tZXRoaW5nXHJcbiAgICBpZiAoc3luY2VkQ291bnQgPiAwKSB7XHJcbiAgICAgIHRyeSB7XHJcbiAgICAgICAgYXdhaXQgc2V0U2V0dGluZygnbGFzdFN5bmMnLCBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCkpXHJcbiAgICAgIH0gY2F0Y2ggKGUpIHtcclxuICAgICAgICBjb25zb2xlLndhcm4oJ0ZhaWxlZCB0byB1cGRhdGUgbGFzdFN5bmMgc2V0dGluZzonLCBlLm1lc3NhZ2UgfHwgZSlcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIHN5bmNlZDogc3luY2VkQ291bnQgfVxyXG4gIH0gY2F0Y2ggKGVycikge1xyXG4gICAgY29uc29sZS5lcnJvcignc3luY1RvQ2xvdWQgZmFpbGVkOicsIGVycilcclxuICAgIHRocm93IGVyclxyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIERlbGV0ZSBpbnZlbnRvcnkgaXRlbSAoc29mdCBkZWxldGUpXHJcbiAqIEBwYXJhbSB7bnVtYmVyfSBpZCAtIEludmVudG9yeSBJRFxyXG4gKiBAcGFyYW0ge2Jvb2xlYW59IGhhcmQgLSBQZXJtYW5lbnRseSBkZWxldGUgKGRlZmF1bHQ6IGZhbHNlKVxyXG4gKi9cclxuZXhwb3J0IGNvbnN0IGRlbGV0ZUludmVudG9yeUl0ZW0gPSBhc3luYyAoaWQsIGhhcmQgPSBmYWxzZSkgPT4ge1xyXG4gIHRyeSB7XHJcbiAgICBjb25zdCBkYiA9IGF3YWl0IGluaXREQigpXHJcbiAgICBjb25zdCB0eCA9IGRiLnRyYW5zYWN0aW9uKCdpbnZlbnRvcnknLCAncmVhZHdyaXRlJylcclxuXHJcbiAgICBpZiAoaGFyZCkge1xyXG4gICAgICBhd2FpdCB0eC5zdG9yZS5kZWxldGUoaWQpXHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBjb25zdCBpdGVtID0gYXdhaXQgdHguc3RvcmUuZ2V0KGlkKVxyXG4gICAgICBpZiAoaXRlbSkge1xyXG4gICAgICAgIGl0ZW0uX2RlbGV0ZWQgPSB0cnVlXHJcbiAgICAgICAgaXRlbS5sYXN0Q2hlY2tlZEF0ID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpXHJcbiAgICAgICAgaXRlbS5zeW5jZWRBdCA9IG51bGxcclxuICAgICAgICBhd2FpdCB0eC5zdG9yZS5wdXQoaXRlbSlcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGF3YWl0IHR4LmRvbmVcclxuXHJcbiAgICAvLyBUcmFjayBjaGFuZ2UgZm9yIHN5bmNcclxuICAgIGF3YWl0IHRyYWNrQ2hhbmdlKCdpbnZlbnRvcnknLCBpZCwgJ2RlbGV0ZScpXHJcbiAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byBkZWxldGUgaW52ZW50b3J5IGl0ZW06JywgZXJyb3IpXHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoYEZhaWxlZCB0byBkZWxldGUgaW52ZW50b3J5IGl0ZW06ICR7ZXJyb3IubWVzc2FnZX1gKVxyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIFVwc2VydCBpbnZlbnRvcnkgaXRlbSAoaW5zZXJ0IG9yIHVwZGF0ZSlcclxuICogVXNlZCBieSBzeW5jIGVuZ2luZSB0byBtZXJnZSByZW1vdGUgZGF0YVxyXG4gKiBAcGFyYW0ge09iamVjdH0gaXRlbSAtIEludmVudG9yeSBpdGVtIGRhdGEgd2l0aCBpZFxyXG4gKi9cclxuZXhwb3J0IGNvbnN0IHVwc2VydEludmVudG9yeUl0ZW0gPSBhc3luYyAoaXRlbSkgPT4ge1xyXG4gIHRyeSB7XHJcbiAgICBjb25zdCBkYiA9IGF3YWl0IGluaXREQigpXHJcbiAgICBjb25zdCB0eCA9IGRiLnRyYW5zYWN0aW9uKCdpbnZlbnRvcnknLCAncmVhZHdyaXRlJylcclxuICAgIGNvbnN0IGV4aXN0aW5nID0gYXdhaXQgdHguc3RvcmUuZ2V0KGl0ZW0uaWQpXHJcblxyXG4gICAgbGV0IGl0ZW1EYXRhXHJcbiAgICBpZiAoZXhpc3RpbmcpIHtcclxuICAgICAgLy8gTWVyZ2UsIGtlZXBpbmcgbmV3ZXIgZGF0YSAoY29uZmxpY3QgcmVzb2x1dGlvbilcclxuICAgICAgY29uc3QgZXhpc3RpbmdUaW1lID0gbmV3IERhdGUoXHJcbiAgICAgICAgZXhpc3RpbmcudXBkYXRlZF9hdCB8fCBleGlzdGluZy51cGRhdGVkQXQgfHwgZXhpc3RpbmcubGFzdENoZWNrZWRBdCB8fCAwLFxyXG4gICAgICApXHJcbiAgICAgIGNvbnN0IHJlbW90ZVRpbWUgPSBuZXcgRGF0ZShpdGVtLnVwZGF0ZWRfYXQgfHwgaXRlbS51cGRhdGVkQXQgfHwgaXRlbS5sYXN0Q2hlY2tlZEF0IHx8IDApXHJcblxyXG4gICAgICBpdGVtRGF0YSA9IHJlbW90ZVRpbWUgPj0gZXhpc3RpbmdUaW1lID8gaXRlbSA6IGV4aXN0aW5nXHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBpdGVtRGF0YSA9IGl0ZW1cclxuICAgIH1cclxuXHJcbiAgICBhd2FpdCB0eC5zdG9yZS5wdXQoaXRlbURhdGEpXHJcbiAgICBhd2FpdCB0eC5kb25lXHJcblxyXG4gICAgcmV0dXJuIGl0ZW1EYXRhLmlkXHJcbiAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byB1cHNlcnQgaW52ZW50b3J5IGl0ZW06JywgZXJyb3IpXHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoYEZhaWxlZCB0byB1cHNlcnQgaW52ZW50b3J5IGl0ZW06ICR7ZXJyb3IubWVzc2FnZX1gKVxyXG4gIH1cclxufVxyXG5cclxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4vLyBTVEFUSVNUSUNTICYgQU5BTFlUSUNTXHJcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuXHJcbi8qKlxyXG4gKiBHZXQgaW52ZW50b3J5IHN0YXRpc3RpY3NcclxuICogQHJldHVybnMge09iamVjdH0gU3RhdHMgb2JqZWN0IHdpdGggdG90YWxJdGVtcyBhbmQgZXhwaXJpbmdTb29uXHJcbiAqL1xyXG5leHBvcnQgY29uc3QgZ2V0SW52ZW50b3J5U3RhdHMgPSBhc3luYyAoaG91c2Vob2xkSWQpID0+IHtcclxuICB0cnkge1xyXG4gICAgaWYgKCFob3VzZWhvbGRJZCkge1xyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0hvdXNlaG9sZCBJRCBpcyByZXF1aXJlZCB0byBnZXQgaW52ZW50b3J5IHN0YXRzJylcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBkYiA9IGF3YWl0IGluaXREQigpXHJcbiAgICBjb25zdCBpbnZlbnRvcnkgPSBhd2FpdCBkYi5nZXRBbGxGcm9tSW5kZXgoJ2ludmVudG9yeScsICdob3VzZWhvbGRfaWQnLCBob3VzZWhvbGRJZClcclxuICAgIGNvbnN0IGFjdGl2ZUludmVudG9yeSA9IGludmVudG9yeS5maWx0ZXIoKGl0ZW0pID0+ICFpdGVtLl9kZWxldGVkKVxyXG5cclxuICAgIGNvbnN0IG5vdyA9IG5ldyBEYXRlKClcclxuICAgIGNvbnN0IHRoaXJ0eURheXNGcm9tTm93ID0gbmV3IERhdGUobm93LmdldFRpbWUoKSArIDMwICogMjQgKiA2MCAqIDYwICogMTAwMClcclxuXHJcbiAgICByZXR1cm4ge1xyXG4gICAgICB0b3RhbEl0ZW1zOiBhY3RpdmVJbnZlbnRvcnkubGVuZ3RoLFxyXG4gICAgICBleHBpcmluZ1Nvb246IGFjdGl2ZUludmVudG9yeS5maWx0ZXIoKGl0ZW0pID0+IHtcclxuICAgICAgICBpZiAoIWl0ZW0uZXhwaXJ5RGF0ZSkgcmV0dXJuIGZhbHNlXHJcbiAgICAgICAgY29uc3QgZXhwaXJ5RGF0ZSA9IG5ldyBEYXRlKGl0ZW0uZXhwaXJ5RGF0ZSlcclxuICAgICAgICByZXR1cm4gZXhwaXJ5RGF0ZSA8PSB0aGlydHlEYXlzRnJvbU5vdyAmJiBleHBpcnlEYXRlID4gbm93XHJcbiAgICAgIH0pLmxlbmd0aCxcclxuICAgIH1cclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIGdldCBpbnZlbnRvcnkgc3RhdHM6JywgZXJyb3IpXHJcbiAgICByZXR1cm4geyB0b3RhbEl0ZW1zOiAwLCBleHBpcmluZ1Nvb246IDAgfVxyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIEdldCBpbnZlbnRvcnkgaXRlbXMgZ3JvdXBlZCBieSBEU0IgY2F0ZWdvcnkgZm9yIGEgaG91c2Vob2xkXHJcbiAqIEBwYXJhbSB7c3RyaW5nfSBob3VzZWhvbGRJZCAtIEhvdXNlaG9sZCBJRFxyXG4gKiBAcmV0dXJucyB7T2JqZWN0fSBPYmplY3Qgd2l0aCBEU0IgY2F0ZWdvcnkga2V5cyBhbmQgaXRlbSBxdWFudGl0aWVzXHJcbiAqL1xyXG5leHBvcnQgY29uc3QgZ2V0SW52ZW50b3J5QnlEc2JDYXRlZ29yeSA9IGFzeW5jIChob3VzZWhvbGRJZCkgPT4ge1xyXG4gIHRyeSB7XHJcbiAgICBpZiAoIWhvdXNlaG9sZElkKSB7XHJcbiAgICAgIHRocm93IG5ldyBFcnJvcignSG91c2Vob2xkIElEIGlzIHJlcXVpcmVkIHRvIGdldCBpbnZlbnRvcnkgYnkgY2F0ZWdvcnknKVxyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IGRiID0gYXdhaXQgaW5pdERCKClcclxuICAgIGNvbnN0IGludmVudG9yeSA9IGF3YWl0IGRiLmdldEFsbEZyb21JbmRleCgnaW52ZW50b3J5JywgJ2hvdXNlaG9sZF9pZCcsIGhvdXNlaG9sZElkKVxyXG4gICAgY29uc3QgYWN0aXZlSW52ZW50b3J5ID0gaW52ZW50b3J5LmZpbHRlcigoaXRlbSkgPT4gIWl0ZW0uX2RlbGV0ZWQpXHJcblxyXG4gICAgLy8gTWFwIHN1cHBseSBjYXRlZ29yaWVzIHRvIERTQiBjYXRlZ29yaWVzXHJcbiAgICBjb25zdCB7IGdldERzYkNhdGVnb3J5IH0gPSByZXF1aXJlKCcuL2NvbnN0YW50cy9jYXRlZ29yaWVzJylcclxuXHJcbiAgICBjb25zdCBjYXRlZ29yeUNvdW50cyA9IHtcclxuICAgICAgd2F0ZXI6IDAsXHJcbiAgICAgIGZvb2Q6IDAsXHJcbiAgICAgIG1lZGljYXRpb25zOiAwLFxyXG4gICAgICBmaXJzdEFpZDogMCxcclxuICAgICAgaHlnaWVuZTogMCxcclxuICAgICAgd2FybXRoOiAwLFxyXG4gICAgICBsaWdodDogMCxcclxuICAgICAgZG9jdW1lbnRzOiAwLFxyXG4gICAgICB0b29sczogMCxcclxuICAgIH1cclxuXHJcbiAgICBhY3RpdmVJbnZlbnRvcnkuZm9yRWFjaCgoaXRlbSkgPT4ge1xyXG4gICAgICBjb25zdCBkc2JDYXRlZ29yeSA9IGdldERzYkNhdGVnb3J5KGl0ZW0uY2F0ZWdvcnkpXHJcbiAgICAgIGlmIChkc2JDYXRlZ29yeSAmJiBjYXRlZ29yeUNvdW50cy5oYXNPd25Qcm9wZXJ0eShkc2JDYXRlZ29yeSkpIHtcclxuICAgICAgICAvLyBGb3IgbW9zdCBpdGVtcywgY291bnQgMSBwZXIgaXRlbS4gRm9yIHdhdGVyL2Zvb2QsIHVzZSBxdWFudGl0eSBpZiBhdmFpbGFibGVcclxuICAgICAgICBjb25zdCBxdWFudGl0eVRvQWRkID0gaXRlbS5xdWFudGl0eSB8fCAxXHJcbiAgICAgICAgaWYgKGRzYkNhdGVnb3J5ID09PSAnd2F0ZXInIHx8IGRzYkNhdGVnb3J5ID09PSAnZm9vZCcpIHtcclxuICAgICAgICAgIGNhdGVnb3J5Q291bnRzW2RzYkNhdGVnb3J5XSArPSBxdWFudGl0eVRvQWRkXHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIGNhdGVnb3J5Q291bnRzW2RzYkNhdGVnb3J5XSArPSAxXHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9KVxyXG5cclxuICAgIHJldHVybiBjYXRlZ29yeUNvdW50c1xyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gZ2V0IGludmVudG9yeSBieSBEU0IgY2F0ZWdvcnk6JywgZXJyb3IpXHJcbiAgICByZXR1cm4ge1xyXG4gICAgICB3YXRlcjogMCxcclxuICAgICAgZm9vZDogMCxcclxuICAgICAgbWVkaWNhdGlvbnM6IDAsXHJcbiAgICAgIGZpcnN0QWlkOiAwLFxyXG4gICAgICBoeWdpZW5lOiAwLFxyXG4gICAgICB3YXJtdGg6IDAsXHJcbiAgICAgIGxpZ2h0OiAwLFxyXG4gICAgICBkb2N1bWVudHM6IDAsXHJcbiAgICAgIHRvb2xzOiAwLFxyXG4gICAgfVxyXG4gIH1cclxufVxyXG5cclxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4vLyBTRVRUSU5HUyBPUEVSQVRJT05TXHJcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuXHJcbi8qKlxyXG4gKiBHZXQgc2V0dGluZyB2YWx1ZVxyXG4gKiBAcGFyYW0ge3N0cmluZ30ga2V5IC0gU2V0dGluZyBrZXlcclxuICogQHJldHVybnMgeyp9IFNldHRpbmcgdmFsdWUgb3IgbnVsbFxyXG4gKi9cclxuZXhwb3J0IGNvbnN0IGdldFNldHRpbmcgPSBhc3luYyAoa2V5KSA9PiB7XHJcbiAgdHJ5IHtcclxuICAgIGNvbnN0IGRiID0gYXdhaXQgaW5pdERCKClcclxuICAgIGNvbnN0IHNldHRpbmcgPSBhd2FpdCBkYi5nZXQoJ3NldHRpbmdzJywga2V5KVxyXG4gICAgcmV0dXJuIHNldHRpbmcgPyBzZXR0aW5nLnZhbHVlIDogbnVsbFxyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gZ2V0IHNldHRpbmc6JywgZXJyb3IpXHJcbiAgICByZXR1cm4gbnVsbFxyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIFNldCBzZXR0aW5nIHZhbHVlXHJcbiAqIEBwYXJhbSB7c3RyaW5nfSBrZXkgLSBTZXR0aW5nIGtleVxyXG4gKiBAcGFyYW0geyp9IHZhbHVlIC0gU2V0dGluZyB2YWx1ZVxyXG4gKi9cclxuZXhwb3J0IGNvbnN0IHNldFNldHRpbmcgPSBhc3luYyAoa2V5LCB2YWx1ZSkgPT4ge1xyXG4gIHRyeSB7XHJcbiAgICBjb25zdCBkYiA9IGF3YWl0IGluaXREQigpXHJcbiAgICBjb25zdCB0eCA9IGRiLnRyYW5zYWN0aW9uKCdzZXR0aW5ncycsICdyZWFkd3JpdGUnKVxyXG5cclxuICAgIGF3YWl0IHR4LnN0b3JlLnB1dCh7XHJcbiAgICAgIGtleSxcclxuICAgICAgdmFsdWUsXHJcbiAgICAgIHVwZGF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICBzeW5jZWRBdDogbnVsbCxcclxuICAgIH0pXHJcblxyXG4gICAgYXdhaXQgdHguZG9uZVxyXG5cclxuICAgIC8vIFRyYWNrIGNoYW5nZSBmb3Igc3luY1xyXG4gICAgYXdhaXQgdHJhY2tDaGFuZ2UoJ3NldHRpbmdzJywga2V5LCAndXBkYXRlJylcclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIHNldCBzZXR0aW5nOicsIGVycm9yKVxyXG4gICAgdGhyb3cgbmV3IEVycm9yKGBGYWlsZWQgdG8gc2F2ZSBzZXR0aW5nOiAke2Vycm9yLm1lc3NhZ2V9YClcclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBGaWVsZCBwcmVmZXJlbmNlcyBkZWZhdWx0IGNvbmZpZ3VyYXRpb25cclxuICogRGVmaW5lcyBhbGwgYXZhaWxhYmxlIGludmVudG9yeSBmaWVsZHMgYW5kIHRoZWlyIGRlZmF1bHQgdmlzaWJpbGl0eS9tYW5kYXRvcnkgc3RhdHVzXHJcbiAqL1xyXG5jb25zdCBERUZBVUxUX0ZJRUxEX1BSRUZFUkVOQ0VTID0ge1xyXG4gIGJhcmNvZGU6IHsgdmlzaWJsZTogdHJ1ZSwgbWFuZGF0b3J5OiBmYWxzZSwgbGFiZWw6ICdCYXJjb2RlJyB9LFxyXG4gIHByb2R1Y3ROYW1lOiB7IHZpc2libGU6IHRydWUsIG1hbmRhdG9yeTogdHJ1ZSwgbGFiZWw6ICdQcm9kdWN0IE5hbWUnIH0sXHJcbiAgcXVhbnRpdHk6IHsgdmlzaWJsZTogdHJ1ZSwgbWFuZGF0b3J5OiB0cnVlLCBsYWJlbDogJ1F1YW50aXR5JyB9LFxyXG4gIHVuaXQ6IHsgdmlzaWJsZTogdHJ1ZSwgbWFuZGF0b3J5OiBmYWxzZSwgbGFiZWw6ICdVbml0JyB9LFxyXG4gIGV4cGlyeURhdGU6IHsgdmlzaWJsZTogdHJ1ZSwgbWFuZGF0b3J5OiB0cnVlLCBsYWJlbDogJ0V4cGlyeSBEYXRlJyB9LFxyXG4gIGNhdGVnb3J5OiB7IHZpc2libGU6IHRydWUsIG1hbmRhdG9yeTogdHJ1ZSwgbGFiZWw6ICdDYXRlZ29yeScgfSxcclxuICBhbGxlcmdlbnM6IHsgdmlzaWJsZTogdHJ1ZSwgbWFuZGF0b3J5OiBmYWxzZSwgbGFiZWw6ICdBbGxlcmdlbnMnIH0sXHJcbiAgc3RvcmFnZUxvY2F0aW9uOiB7IHZpc2libGU6IHRydWUsIG1hbmRhdG9yeTogZmFsc2UsIGxhYmVsOiAnU3RvcmFnZSBMb2NhdGlvbicgfSxcclxuICBjb3N0OiB7IHZpc2libGU6IGZhbHNlLCBtYW5kYXRvcnk6IGZhbHNlLCBsYWJlbDogJ0Nvc3QvUHJpY2UnIH0sXHJcbiAgcHVyY2hhc2VEYXRlOiB7IHZpc2libGU6IHRydWUsIG1hbmRhdG9yeTogZmFsc2UsIGxhYmVsOiAnUHVyY2hhc2UgRGF0ZScgfSxcclxuICBwcmVmZXJyZWRDb25zdW1wdGlvbkRhdGU6IHsgdmlzaWJsZTogZmFsc2UsIG1hbmRhdG9yeTogZmFsc2UsIGxhYmVsOiAnUHJlZmVycmVkIENvbnN1bXB0aW9uIERhdGUnIH0sXHJcbiAgc3VwcGxpZXI6IHsgdmlzaWJsZTogZmFsc2UsIG1hbmRhdG9yeTogZmFsc2UsIGxhYmVsOiAnU3VwcGxpZXIvU291cmNlJyB9LFxyXG4gIHN0b3JhZ2VOb3RlczogeyB2aXNpYmxlOiBmYWxzZSwgbWFuZGF0b3J5OiBmYWxzZSwgbGFiZWw6ICdTdG9yYWdlIE5vdGVzJyB9LFxyXG4gIGl0ZW1TdGF0dXM6IHsgdmlzaWJsZTogZmFsc2UsIG1hbmRhdG9yeTogZmFsc2UsIGxhYmVsOiAnSXRlbSBTdGF0dXMnIH0sXHJcbiAgbG90TnVtYmVyOiB7IHZpc2libGU6IGZhbHNlLCBtYW5kYXRvcnk6IGZhbHNlLCBsYWJlbDogJ0xvdC9CYXRjaCBOdW1iZXInIH0sXHJcbiAgbnV0cml0aW9uSW5mbzogeyB2aXNpYmxlOiBmYWxzZSwgbWFuZGF0b3J5OiBmYWxzZSwgbGFiZWw6ICdOdXRyaXRpb25hbCBWYWx1ZScgfSxcclxuICBkaWV0YXJ5UmVzdHJpY3Rpb25zOiB7IHZpc2libGU6IGZhbHNlLCBtYW5kYXRvcnk6IGZhbHNlLCBsYWJlbDogJ0RpZXRhcnkgUmVzdHJpY3Rpb25zJyB9LFxyXG4gIHByaW9yaXR5TGV2ZWw6IHsgdmlzaWJsZTogZmFsc2UsIG1hbmRhdG9yeTogZmFsc2UsIGxhYmVsOiAnUHJpb3JpdHkgTGV2ZWwnIH0sXHJcbiAgcGFja2FnaW5nOiB7IHZpc2libGU6IGZhbHNlLCBtYW5kYXRvcnk6IGZhbHNlLCBsYWJlbDogJ1BhY2thZ2luZyBEZXRhaWxzJyB9LFxyXG59XHJcblxyXG4vKipcclxuICogR2V0IGZpZWxkIHByZWZlcmVuY2VzIGZvciB0aGUgdXNlclxyXG4gKiBSZXR1cm5zIGRlZmF1bHQgcHJlZmVyZW5jZXMgaWYgbm90IHNldFxyXG4gKi9cclxuZXhwb3J0IGNvbnN0IGdldEZpZWxkUHJlZmVyZW5jZXMgPSBhc3luYyAoKSA9PiB7XHJcbiAgdHJ5IHtcclxuICAgIGNvbnN0IHByZWZzID0gYXdhaXQgZ2V0U2V0dGluZygnZmllbGRQcmVmZXJlbmNlcycpXHJcbiAgICBpZiAoIXByZWZzKSB7XHJcbiAgICAgIHJldHVybiBERUZBVUxUX0ZJRUxEX1BSRUZFUkVOQ0VTXHJcbiAgICB9XHJcbiAgICAvLyBNZXJnZSB3aXRoIGRlZmF1bHRzIHRvIGVuc3VyZSBuZXcgZmllbGRzIGFyZSBpbmNsdWRlZFxyXG4gICAgcmV0dXJuIHsgLi4uREVGQVVMVF9GSUVMRF9QUkVGRVJFTkNFUywgLi4ucHJlZnMgfVxyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gZ2V0IGZpZWxkIHByZWZlcmVuY2VzOicsIGVycm9yKVxyXG4gICAgcmV0dXJuIERFRkFVTFRfRklFTERfUFJFRkVSRU5DRVNcclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBTZXQgZmllbGQgcHJlZmVyZW5jZXNcclxuICogQHBhcmFtIHtPYmplY3R9IHByZWZlcmVuY2VzIC0gRmllbGQgcHJlZmVyZW5jZXMgb2JqZWN0XHJcbiAqL1xyXG5leHBvcnQgY29uc3Qgc2V0RmllbGRQcmVmZXJlbmNlcyA9IGFzeW5jIChwcmVmZXJlbmNlcykgPT4ge1xyXG4gIHRyeSB7XHJcbiAgICBjb25zdCBtZXJnZWQgPSB7IC4uLkRFRkFVTFRfRklFTERfUFJFRkVSRU5DRVMsIC4uLnByZWZlcmVuY2VzIH1cclxuICAgIGF3YWl0IHNldFNldHRpbmcoJ2ZpZWxkUHJlZmVyZW5jZXMnLCBtZXJnZWQpXHJcbiAgICByZXR1cm4gbWVyZ2VkXHJcbiAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byBzZXQgZmllbGQgcHJlZmVyZW5jZXM6JywgZXJyb3IpXHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoYEZhaWxlZCB0byBzYXZlIGZpZWxkIHByZWZlcmVuY2VzOiAke2Vycm9yLm1lc3NhZ2V9YClcclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBSZXNldCBmaWVsZCBwcmVmZXJlbmNlcyB0byBkZWZhdWx0c1xyXG4gKi9cclxuZXhwb3J0IGNvbnN0IHJlc2V0RmllbGRQcmVmZXJlbmNlcyA9IGFzeW5jICgpID0+IHtcclxuICB0cnkge1xyXG4gICAgYXdhaXQgc2V0U2V0dGluZygnZmllbGRQcmVmZXJlbmNlcycsIERFRkFVTFRfRklFTERfUFJFRkVSRU5DRVMpXHJcbiAgICByZXR1cm4gREVGQVVMVF9GSUVMRF9QUkVGRVJFTkNFU1xyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gcmVzZXQgZmllbGQgcHJlZmVyZW5jZXM6JywgZXJyb3IpXHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoYEZhaWxlZCB0byByZXNldCBmaWVsZCBwcmVmZXJlbmNlczogJHtlcnJvci5tZXNzYWdlfWApXHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogR2V0IHZpc2libGUgYW5kIG1hbmRhdG9yeSBmaWVsZHNcclxuICogQHJldHVybnMge09iamVjdH0gT2JqZWN0IHdpdGggdmlzaWJsZUZpZWxkcyBhbmQgbWFuZGF0b3J5RmllbGRzIGFycmF5c1xyXG4gKi9cclxuZXhwb3J0IGNvbnN0IGdldEFjdGl2ZUZpZWxkQ29uZmlnID0gYXN5bmMgKCkgPT4ge1xyXG4gIGNvbnN0IHByZWZzID0gYXdhaXQgZ2V0RmllbGRQcmVmZXJlbmNlcygpXHJcbiAgY29uc3QgdmlzaWJsZUZpZWxkcyA9IE9iamVjdC5rZXlzKHByZWZzKS5maWx0ZXIoKGtleSkgPT4gcHJlZnNba2V5XS52aXNpYmxlKVxyXG4gIGNvbnN0IG1hbmRhdG9yeUZpZWxkcyA9IE9iamVjdC5rZXlzKHByZWZzKS5maWx0ZXIoKGtleSkgPT4gcHJlZnNba2V5XS5tYW5kYXRvcnkpXHJcbiAgcmV0dXJuIHsgdmlzaWJsZUZpZWxkcywgbWFuZGF0b3J5RmllbGRzLCBwcmVmZXJlbmNlczogcHJlZnMgfVxyXG59XHJcblxyXG4vKipcclxuICogR2V0IGhvdXNlaG9sZCBzaXplXHJcbiAqIEByZXR1cm5zIHtPYmplY3R9IEhvdXNlaG9sZCBzaXplIHthZHVsdHMsIGNoaWxkcmVufVxyXG4gKi9cclxuZXhwb3J0IGNvbnN0IGdldEhvdXNlaG9sZFNpemUgPSBhc3luYyAoKSA9PiB7XHJcbiAgdHJ5IHtcclxuICAgIGNvbnN0IHNpemUgPSBhd2FpdCBnZXRTZXR0aW5nKCdob3VzZWhvbGRTaXplJylcclxuICAgIHJldHVybiBzaXplIHx8IHsgYWR1bHRzOiAxLCBjaGlsZHJlbjogMCB9XHJcbiAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byBnZXQgaG91c2Vob2xkIHNpemU6JywgZXJyb3IpXHJcbiAgICByZXR1cm4geyBhZHVsdHM6IDEsIGNoaWxkcmVuOiAwIH1cclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBTZXQgaG91c2Vob2xkIHNpemVcclxuICogQHBhcmFtIHtudW1iZXJ9IGFkdWx0cyAtIE51bWJlciBvZiBhZHVsdHNcclxuICogQHBhcmFtIHtudW1iZXJ9IGNoaWxkcmVuIC0gTnVtYmVyIG9mIGNoaWxkcmVuXHJcbiAqL1xyXG5leHBvcnQgY29uc3Qgc2V0SG91c2Vob2xkU2l6ZSA9IGFzeW5jIChhZHVsdHMsIGNoaWxkcmVuKSA9PiB7XHJcbiAgdHJ5IHtcclxuICAgIGF3YWl0IHNldFNldHRpbmcoJ2hvdXNlaG9sZFNpemUnLCB7IGFkdWx0cywgY2hpbGRyZW4gfSlcclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIHNldCBob3VzZWhvbGQgc2l6ZTonLCBlcnJvcilcclxuICAgIHRocm93IGVycm9yXHJcbiAgfVxyXG59XHJcblxyXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbi8vIFJFQURJTkVTUyBDQUxDVUxBVElPTlxyXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcblxyXG4vKipcclxuICogQ2FsY3VsYXRlIGVtZXJnZW5jeSByZWFkaW5lc3MgYmFzZWQgb24gRFNCIHJlY29tbWVuZGF0aW9uc1xyXG4gKiBAcmV0dXJucyB7T2JqZWN0fSBSZWFkaW5lc3MgZGF0YSB7cGVyY2VudGFnZSwgdG90YWxSZXF1aXJlZCwgdG90YWxNZXQsIG1pc3Npbmd9XHJcbiAqIFxyXG4gKiBOT1RFOiBNVlAgdjIgc2ltcGxpZmllZCB2ZXJzaW9uIC0gYmFzaWMgcmVhZGluZXNzIGNhbGN1bGF0aW9uXHJcbiAqIEZ1bGwgRFNCLWJhc2VkIGltcGxlbWVudGF0aW9uIGF2YWlsYWJsZSBpbiBmdXR1cmUgdmVyc2lvbnNcclxuICovXHJcbmV4cG9ydCBjb25zdCBjYWxjdWxhdGVSZWFkaW5lc3MgPSBhc3luYyAoKSA9PiB7XHJcbiAgdHJ5IHtcclxuICAgIGNvbnN0IGludmVudG9yeSA9IGF3YWl0IGdldEludmVudG9yeSgpXHJcbiAgICAvLyBNVlAgdjIgc2ltcGxpZmllZDogY2FsY3VsYXRlIHJlYWRpbmVzcyBiYXNlZCBvbiBpdGVtIGNvdW50IGFuZCBleHBpcnlcclxuICAgIGNvbnN0IHRvdGFsSXRlbXMgPSBpbnZlbnRvcnkubGVuZ3RoXHJcbiAgICBjb25zdCBleHBpcmluZ0l0ZW1zID0gaW52ZW50b3J5LmZpbHRlcigoaXRlbSkgPT4ge1xyXG4gICAgICBpZiAoIWl0ZW0uZXhwaXJ5RGF0ZSkgcmV0dXJuIGZhbHNlXHJcbiAgICAgIGNvbnN0IGRheXMgPSBNYXRoLmNlaWwoKG5ldyBEYXRlKGl0ZW0uZXhwaXJ5RGF0ZSkgLSBuZXcgRGF0ZSgpKSAvICgxMDAwICogNjAgKiA2MCAqIDI0KSlcclxuICAgICAgcmV0dXJuIGRheXMgPD0gMzAgJiYgZGF5cyA+IDBcclxuICAgIH0pLmxlbmd0aFxyXG5cclxuICAgIC8vIFNpbXBsZSByZWFkaW5lc3M6IDEwMCUgaWYgaGF2ZSBpdGVtcywgbG93ZXIgaWYgZXhwaXJpbmcgc29vblxyXG4gICAgY29uc3QgdG90YWxNZXQgPSB0b3RhbEl0ZW1zIC0gZXhwaXJpbmdJdGVtc1xyXG4gICAgY29uc3QgcGVyY2VudGFnZSA9IHRvdGFsSXRlbXMgPiAwID8gTWF0aC5yb3VuZCgodG90YWxNZXQgLyB0b3RhbEl0ZW1zKSAqIDEwMCkgOiAwXHJcblxyXG4gICAgcmV0dXJuIHtcclxuICAgICAgcGVyY2VudGFnZSxcclxuICAgICAgdG90YWxSZXF1aXJlZDogdG90YWxJdGVtcyxcclxuICAgICAgdG90YWxNZXQsXHJcbiAgICAgIG1pc3Npbmc6IGV4cGlyaW5nSXRlbXMsXHJcbiAgICB9XHJcbiAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byBjYWxjdWxhdGUgcmVhZGluZXNzOicsIGVycm9yKVxyXG4gICAgcmV0dXJuIHtcclxuICAgICAgcGVyY2VudGFnZTogMCxcclxuICAgICAgdG90YWxSZXF1aXJlZDogMCxcclxuICAgICAgdG90YWxNZXQ6IDAsXHJcbiAgICAgIG1pc3Npbmc6IDAsXHJcbiAgICB9XHJcbiAgfVxyXG59XHJcblxyXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbi8vIE5IT1NUIFNZTkMgLSBGdW5jdGlvbnMgZXhwb3J0ZWQgYWJvdmUgYXMgbmFtZWQgZXhwb3J0c1xyXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcblxyXG4vKipcclxuICogQWRkIGVudHJ5IHRvIHN5bmMgbG9nIGZvciBvZmZsaW5lIGNoYW5nZXNcclxuICogQHBhcmFtIHtzdHJpbmd9IG9wZXJhdGlvbiAtICdjcmVhdGUnLCAndXBkYXRlJywgJ2RlbGV0ZSdcclxuICogQHBhcmFtIHtzdHJpbmd9IHRhYmxlTmFtZSAtICdpbnZlbnRvcnknIG9yIG90aGVyIHRhYmxlXHJcbiAqIEBwYXJhbSB7bnVtYmVyfSByZWNvcmRJZCAtIElEIG9mIHRoZSByZWNvcmRcclxuICogQHBhcmFtIHtPYmplY3R9IGNoYW5nZXMgLSBUaGUgZGF0YSBiZWluZyBzeW5jZWRcclxuICovXHJcbmV4cG9ydCBjb25zdCBhZGRTeW5jTG9nID0gYXN5bmMgKG9wZXJhdGlvbiwgdGFibGVOYW1lLCByZWNvcmRJZCwgY2hhbmdlcykgPT4ge1xyXG4gIHRyeSB7XHJcbiAgICBjb25zdCBkYiA9IGF3YWl0IGluaXREQigpXHJcbiAgICBjb25zdCB0eCA9IGRiLnRyYW5zYWN0aW9uKCdzeW5jX2xvZycsICdyZWFkd3JpdGUnKVxyXG5cclxuICAgIGNvbnN0IHN5bmNFbnRyeSA9IHtcclxuICAgICAgb3BlcmF0aW9uLFxyXG4gICAgICB0YWJsZU5hbWUsXHJcbiAgICAgIHJlY29yZElkLFxyXG4gICAgICBjaGFuZ2VzLFxyXG4gICAgICBzdGF0dXM6ICdwZW5kaW5nJyxcclxuICAgICAgY3JlYXRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgIHN5bmNlZEF0OiBudWxsLFxyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IGlkID0gYXdhaXQgdHguc3RvcmUuYWRkKHN5bmNFbnRyeSlcclxuICAgIGF3YWl0IHR4LmRvbmVcclxuXHJcbiAgICBjb25zb2xlLmxvZyhgW1NZTkMgTE9HXSBBZGRlZCAke29wZXJhdGlvbn0gZm9yICR7dGFibGVOYW1lfToke3JlY29yZElkfWApXHJcbiAgICByZXR1cm4gaWRcclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIGFkZCBzeW5jIGxvZzonLCBlcnJvcilcclxuICAgIHRocm93IGVycm9yXHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogR2V0IHN5bmMgbG9nIGVudHJpZXNcclxuICogQHBhcmFtIHtzdHJpbmd9IHN0YXR1cyAtIEZpbHRlciBieSBzdGF0dXMgKCdwZW5kaW5nJywgJ3N5bmNlZCcsICdmYWlsZWQnKVxyXG4gKiBAcmV0dXJucyB7QXJyYXl9IFN5bmMgbG9nIGVudHJpZXNcclxuICovXHJcbmV4cG9ydCBjb25zdCBnZXRTeW5jTG9nID0gYXN5bmMgKHN0YXR1cyA9IG51bGwpID0+IHtcclxuICB0cnkge1xyXG4gICAgY29uc3QgZGIgPSBhd2FpdCBpbml0REIoKVxyXG4gICAgY29uc3QgbG9ncyA9IGF3YWl0IGRiLmdldEFsbCgnc3luY19sb2cnKVxyXG5cclxuICAgIGlmIChzdGF0dXMpIHtcclxuICAgICAgcmV0dXJuIGxvZ3MuZmlsdGVyKChsb2cpID0+IGxvZy5zdGF0dXMgPT09IHN0YXR1cylcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gbG9nc1xyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gZ2V0IHN5bmMgbG9nOicsIGVycm9yKVxyXG4gICAgcmV0dXJuIFtdXHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogR2V0IHBlbmRpbmcgc3luY3NcclxuICogQHJldHVybnMge0FycmF5fSBQZW5kaW5nIHN5bmMgZW50cmllc1xyXG4gKi9cclxuZXhwb3J0IGNvbnN0IGdldFBlbmRpbmdTeW5jcyA9IGFzeW5jICgpID0+IHtcclxuICByZXR1cm4gZ2V0U3luY0xvZygncGVuZGluZycpXHJcbn1cclxuXHJcbi8qKlxyXG4gKiBNYXJrIHN5bmMgZW50cnkgYXMgc3VjY2Vzc2Z1bFxyXG4gKiBAcGFyYW0ge251bWJlcn0gc3luY0lkIC0gSUQgb2Ygc3luYyBsb2cgZW50cnlcclxuICovXHJcbmV4cG9ydCBjb25zdCBtYXJrU3luY1N1Y2Nlc3MgPSBhc3luYyAoc3luY0lkKSA9PiB7XHJcbiAgdHJ5IHtcclxuICAgIGNvbnN0IGRiID0gYXdhaXQgaW5pdERCKClcclxuICAgIGNvbnN0IHR4ID0gZGIudHJhbnNhY3Rpb24oJ3N5bmNfbG9nJywgJ3JlYWR3cml0ZScpXHJcblxyXG4gICAgY29uc3QgZW50cnkgPSBhd2FpdCB0eC5zdG9yZS5nZXQoc3luY0lkKVxyXG4gICAgaWYgKGVudHJ5KSB7XHJcbiAgICAgIGVudHJ5LnN0YXR1cyA9ICdzeW5jZWQnXHJcbiAgICAgIGVudHJ5LnN5bmNlZEF0ID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpXHJcbiAgICAgIGF3YWl0IHR4LnN0b3JlLnB1dChlbnRyeSlcclxuICAgIH1cclxuXHJcbiAgICBhd2FpdCB0eC5kb25lXHJcbiAgICBjb25zb2xlLmxvZyhgW1NZTkNdIE1hcmtlZCBzeW5jICR7c3luY0lkfSBhcyBzdWNjZXNzZnVsYClcclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIG1hcmsgc3luYyBzdWNjZXNzOicsIGVycm9yKVxyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIE1hcmsgc3luYyBlbnRyeSBhcyBmYWlsZWRcclxuICogQHBhcmFtIHtudW1iZXJ9IHN5bmNJZCAtIElEIG9mIHN5bmMgbG9nIGVudHJ5XHJcbiAqIEBwYXJhbSB7c3RyaW5nfSBlcnJvck1lc3NhZ2UgLSBFcnJvciBkZXNjcmlwdGlvblxyXG4gKi9cclxuZXhwb3J0IGNvbnN0IG1hcmtTeW5jRmFpbGVkID0gYXN5bmMgKHN5bmNJZCwgZXJyb3JNZXNzYWdlKSA9PiB7XHJcbiAgdHJ5IHtcclxuICAgIGNvbnN0IGRiID0gYXdhaXQgaW5pdERCKClcclxuICAgIGNvbnN0IHR4ID0gZGIudHJhbnNhY3Rpb24oJ3N5bmNfbG9nJywgJ3JlYWR3cml0ZScpXHJcblxyXG4gICAgY29uc3QgZW50cnkgPSBhd2FpdCB0eC5zdG9yZS5nZXQoc3luY0lkKVxyXG4gICAgaWYgKGVudHJ5KSB7XHJcbiAgICAgIGVudHJ5LnN0YXR1cyA9ICdmYWlsZWQnXHJcbiAgICAgIGVudHJ5LmVycm9yTWVzc2FnZSA9IGVycm9yTWVzc2FnZVxyXG4gICAgICBhd2FpdCB0eC5zdG9yZS5wdXQoZW50cnkpXHJcbiAgICB9XHJcblxyXG4gICAgYXdhaXQgdHguZG9uZVxyXG4gICAgY29uc29sZS5sb2coYFtTWU5DXSBNYXJrZWQgc3luYyAke3N5bmNJZH0gYXMgZmFpbGVkOiAke2Vycm9yTWVzc2FnZX1gKVxyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gbWFyayBzeW5jIGZhaWxlZDonLCBlcnJvcilcclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBDbGVhciBhbGwgc3luY2VkIGVudHJpZXMgZnJvbSBzeW5jIGxvZ1xyXG4gKi9cclxuZXhwb3J0IGNvbnN0IGNsZWFyU3luY0xvZyA9IGFzeW5jICgpID0+IHtcclxuICB0cnkge1xyXG4gICAgY29uc3QgZGIgPSBhd2FpdCBpbml0REIoKVxyXG4gICAgY29uc3QgdHggPSBkYi50cmFuc2FjdGlvbignc3luY19sb2cnLCAncmVhZHdyaXRlJylcclxuXHJcbiAgICBjb25zdCBsb2dzID0gYXdhaXQgdHguc3RvcmUuZ2V0QWxsKClcclxuICAgIGZvciAoY29uc3QgbG9nIG9mIGxvZ3MpIHtcclxuICAgICAgaWYgKGxvZy5zdGF0dXMgPT09ICdzeW5jZWQnKSB7XHJcbiAgICAgICAgYXdhaXQgdHguc3RvcmUuZGVsZXRlKGxvZy5jcmVhdGVkQXQpXHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBhd2FpdCB0eC5kb25lXHJcbiAgICBjb25zb2xlLmxvZygnW1NZTkNdIENsZWFyZWQgc3luY2VkIGVudHJpZXMgZnJvbSBzeW5jIGxvZycpXHJcbiAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byBjbGVhciBzeW5jIGxvZzonLCBlcnJvcilcclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0IGxvY2FsIGRhdGEgZm9ybWF0IHRvIE5ob3N0IGZvcm1hdFxyXG4gKiBAcGFyYW0ge09iamVjdH0gaXRlbSAtIExvY2FsIGludmVudG9yeSBpdGVtXHJcbiAqIEByZXR1cm5zIHtPYmplY3R9IE5ob3N0LWZvcm1hdHRlZCBpdGVtXHJcbiAqL1xyXG5mdW5jdGlvbiBjb252ZXJ0VG9OaG9zdEZvcm1hdChpdGVtKSB7XHJcbiAgY29uc3Qgbmhvc3RJdGVtID0ge1xyXG4gICAgYmFyY29kZTogaXRlbS5iYXJjb2RlIHx8IG51bGwsXHJcbiAgICBwcm9kdWN0X25hbWU6IGl0ZW0ucHJvZHVjdE5hbWUsXHJcbiAgICBxdWFudGl0eTogaXRlbS5xdWFudGl0eSxcclxuICAgIHVuaXQ6IGl0ZW0udW5pdCxcclxuICAgIGV4cGlyeV9kYXRlOiBpdGVtLmV4cGlyeURhdGUsXHJcbiAgICBwdXJjaGFzZV9kYXRlOiBpdGVtLnB1cmNoYXNlRGF0ZSB8fCBudWxsLFxyXG4gICAgcHJlZmVycmVkX2NvbnN1bXB0aW9uX2RhdGU6IGl0ZW0ucHJlZmVycmVkQ29uc3VtcHRpb25EYXRlIHx8IG51bGwsXHJcbiAgICBzdG9yYWdlX2xvY2F0aW9uOiBpdGVtLnN0b3JhZ2VMb2NhdGlvbiB8fCBudWxsLFxyXG4gICAgaXRlbV9zdGF0dXM6IGl0ZW0uaXRlbVN0YXR1cyB8fCAndW5vcGVuZWQnLFxyXG4gICAgc3RvcmFnZV9ub3RlczogaXRlbS5zdG9yYWdlTm90ZXMgfHwgbnVsbCxcclxuICAgIGFsbGVyZ2VuczogaXRlbS5hbGxlcmdlbnMgfHwgbnVsbCxcclxuICAgIGRpZXRhcnlfcmVzdHJpY3Rpb25zOiBpdGVtLmRpZXRhcnlSZXN0cmljdGlvbnMgfHwgW10sXHJcbiAgICBjb3N0OiBpdGVtLmNvc3QgPyBwYXJzZUZsb2F0KGl0ZW0uY29zdCkgOiBudWxsLFxyXG4gICAgc3VwcGxpZXI6IGl0ZW0uc3VwcGxpZXIgfHwgbnVsbCxcclxuICAgIGxvdF9udW1iZXI6IGl0ZW0ubG90TnVtYmVyIHx8IG51bGwsXHJcbiAgICBudXRyaXRpb25faW5mbzogaXRlbS5udXRyaXRpb25JbmZvIHx8IG51bGwsXHJcbiAgICBwcmlvcml0eV9sZXZlbDogaXRlbS5wcmlvcml0eUxldmVsIHx8ICdpbXBvcnRhbnQnLFxyXG4gICAgcGFja2FnaW5nOiBpdGVtLnBhY2thZ2luZyB8fCBudWxsLFxyXG4gIH1cclxuXHJcbiAgcmV0dXJuIG5ob3N0SXRlbVxyXG59XHJcblxyXG4vKipcclxuICogU3luYyBvZmZsaW5lIGludmVudG9yeSBpdGVtcyB0byBOaG9zdFxyXG4gKiBAcGFyYW0ge09iamVjdH0gbmhvc3RDbGllbnQgLSBOaG9zdCBjbGllbnQgaW5zdGFuY2VcclxuICogQHJldHVybnMge09iamVjdH0gU3luYyByZXN1bHRzXHJcbiAqL1xyXG5leHBvcnQgY29uc3Qgc3luY1RvTmhvc3QgPSBhc3luYyAobmhvc3RDbGllbnQpID0+IHtcclxuICBpZiAoIW5ob3N0Q2xpZW50IHx8ICFuaG9zdENsaWVudC5ncmFwaHFsLnJlcXVlc3QpIHtcclxuICAgIGNvbnNvbGUud2FybignW1NZTkNdIE5ob3N0IGNsaWVudCBub3QgYXZhaWxhYmxlLCBza2lwcGluZyBzeW5jJylcclxuICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBzeW5jZWQ6IDAsIGZhaWxlZDogMCwgbWVzc2FnZTogJ05ob3N0IG5vdCBjb25maWd1cmVkJyB9XHJcbiAgfVxyXG5cclxuICB0cnkge1xyXG4gICAgY29uc3QgcGVuZGluZ1N5bmNzID0gYXdhaXQgZ2V0UGVuZGluZ1N5bmNzKClcclxuXHJcbiAgICBpZiAocGVuZGluZ1N5bmNzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICBjb25zb2xlLmxvZygnW1NZTkNdIE5vIHBlbmRpbmcgc3luY3MnKVxyXG4gICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBzeW5jZWQ6IDAsIGZhaWxlZDogMCwgbWVzc2FnZTogJ05vIHBlbmRpbmcgaXRlbXMnIH1cclxuICAgIH1cclxuXHJcbiAgICBjb25zb2xlLmxvZyhgW1NZTkNdIFN0YXJ0aW5nIHN5bmMgb2YgJHtwZW5kaW5nU3luY3MubGVuZ3RofSBpdGVtc2ApXHJcblxyXG4gICAgbGV0IHN5bmNlZCA9IDBcclxuICAgIGxldCBmYWlsZWQgPSAwXHJcblxyXG4gICAgZm9yIChjb25zdCBzeW5jRW50cnkgb2YgcGVuZGluZ1N5bmNzKSB7XHJcbiAgICAgIHRyeSB7XHJcbiAgICAgICAgY29uc3QgeyBvcGVyYXRpb24sIHRhYmxlTmFtZSwgcmVjb3JkSWQsIGNoYW5nZXMgfSA9IHN5bmNFbnRyeVxyXG5cclxuICAgICAgICBpZiAodGFibGVOYW1lICE9PSAnaW52ZW50b3J5Jykge1xyXG4gICAgICAgICAgYXdhaXQgbWFya1N5bmNTdWNjZXNzKHN5bmNFbnRyeS5jcmVhdGVkQXQpXHJcbiAgICAgICAgICBzeW5jZWQrK1xyXG4gICAgICAgICAgY29udGludWVcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIEJ1aWxkIEdyYXBoUUwgbXV0YXRpb24gZm9yIGludmVudG9yeVxyXG4gICAgICAgIGxldCBtdXRhdGlvblxyXG4gICAgICAgIGxldCB2YXJpYWJsZXMgPSB7IGRhdGE6IGNvbnZlcnRUb05ob3N0Rm9ybWF0KGNoYW5nZXMpIH1cclxuXHJcbiAgICAgICAgaWYgKG9wZXJhdGlvbiA9PT0gJ2NyZWF0ZScpIHtcclxuICAgICAgICAgIG11dGF0aW9uID0gYFxyXG4gICAgICAgICAgICBtdXRhdGlvbiBDcmVhdGVJbnZlbnRvcnlJdGVtKCRkYXRhOiBpbnZlbnRvcnlfaW5zZXJ0X2lucHV0ISkge1xyXG4gICAgICAgICAgICAgIGluc2VydF9pbnZlbnRvcnlfb25lKG9iamVjdDogJGRhdGEpIHtcclxuICAgICAgICAgICAgICAgIGlkXHJcbiAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICBgXHJcbiAgICAgICAgfSBlbHNlIGlmIChvcGVyYXRpb24gPT09ICd1cGRhdGUnKSB7XHJcbiAgICAgICAgICBtdXRhdGlvbiA9IGBcclxuICAgICAgICAgICAgbXV0YXRpb24gVXBkYXRlSW52ZW50b3J5SXRlbSgkaWQ6IHV1aWQhLCAkZGF0YTogaW52ZW50b3J5X3NldF9pbnB1dCEpIHtcclxuICAgICAgICAgICAgICB1cGRhdGVfaW52ZW50b3J5X2J5X3BrKHBrX2NvbHVtbnM6IHsgaWQ6ICRpZCB9LCBfc2V0OiAkZGF0YSkge1xyXG4gICAgICAgICAgICAgICAgaWRcclxuICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgIGBcclxuICAgICAgICAgIHZhcmlhYmxlcy5pZCA9IHJlY29yZElkXHJcbiAgICAgICAgfSBlbHNlIGlmIChvcGVyYXRpb24gPT09ICdkZWxldGUnKSB7XHJcbiAgICAgICAgICBtdXRhdGlvbiA9IGBcclxuICAgICAgICAgICAgbXV0YXRpb24gRGVsZXRlSW52ZW50b3J5SXRlbSgkaWQ6IHV1aWQhKSB7XHJcbiAgICAgICAgICAgICAgZGVsZXRlX2ludmVudG9yeV9ieV9wayhpZDogJGlkKSB7XHJcbiAgICAgICAgICAgICAgICBpZFxyXG4gICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgYFxyXG4gICAgICAgICAgdmFyaWFibGVzLmlkID0gcmVjb3JkSWRcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmICghbXV0YXRpb24pIHtcclxuICAgICAgICAgIGF3YWl0IG1hcmtTeW5jRmFpbGVkKHN5bmNFbnRyeS5jcmVhdGVkQXQsICdVbmtub3duIG9wZXJhdGlvbicpXHJcbiAgICAgICAgICBmYWlsZWQrK1xyXG4gICAgICAgICAgY29udGludWVcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIEV4ZWN1dGUgbXV0YXRpb25cclxuICAgICAgICBhd2FpdCBuaG9zdENsaWVudC5ncmFwaHFsLnJlcXVlc3Qoe1xyXG4gICAgICAgICAgcXVlcnk6IG11dGF0aW9uLFxyXG4gICAgICAgICAgdmFyaWFibGVzLFxyXG4gICAgICAgIH0pXHJcblxyXG4gICAgICAgIGF3YWl0IG1hcmtTeW5jU3VjY2VzcyhzeW5jRW50cnkuY3JlYXRlZEF0KVxyXG4gICAgICAgIHN5bmNlZCsrXHJcbiAgICAgIH0gY2F0Y2ggKGl0ZW1FcnJvcikge1xyXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoYFtTWU5DXSBGYWlsZWQgdG8gc3luYyBpdGVtOmAsIGl0ZW1FcnJvcilcclxuICAgICAgICBhd2FpdCBtYXJrU3luY0ZhaWxlZChzeW5jRW50cnkuY3JlYXRlZEF0LCBpdGVtRXJyb3IubWVzc2FnZSlcclxuICAgICAgICBmYWlsZWQrK1xyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgY29uc29sZS5sb2coYFtTWU5DXSBDb21wbGV0ZWQ6ICR7c3luY2VkfSBzeW5jZWQsICR7ZmFpbGVkfSBmYWlsZWRgKVxyXG5cclxuICAgIHJldHVybiB7XHJcbiAgICAgIHN1Y2Nlc3M6IGZhaWxlZCA9PT0gMCxcclxuICAgICAgc3luY2VkLFxyXG4gICAgICBmYWlsZWQsXHJcbiAgICAgIG1lc3NhZ2U6IGBTeW5jZWQgJHtzeW5jZWR9IGl0ZW1zJHtmYWlsZWQgPiAwID8gYCwgJHtmYWlsZWR9IGZhaWxlZGAgOiAnJ31gLFxyXG4gICAgfVxyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBjb25zb2xlLmVycm9yKCdbU1lOQ10gU3luYyBmYWlsZWQ6JywgZXJyb3IpXHJcbiAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgc3luY2VkOiAwLCBmYWlsZWQ6IDAsIG1lc3NhZ2U6IGVycm9yLm1lc3NhZ2UgfVxyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIEZldGNoIGNoYW5nZXMgZnJvbSBjbG91ZCBhbmQgYXBwbHkgdG8gbG9jYWwgREIgZm9yIGEgaG91c2Vob2xkXHJcbiAqIC0gVXNlcyBzZXJ2ZXIgYHVwZGF0ZWRfYXRgIGFzIGF1dGhvcml0YXRpdmUgdGltZXN0YW1wXHJcbiAqL1xyXG5leHBvcnQgY29uc3QgZmV0Y2hGcm9tQ2xvdWQgPSBhc3luYyAoaG91c2Vob2xkSWQpID0+IHtcclxuICB0cnkge1xyXG4gICAgaWYgKCFob3VzZWhvbGRJZCkgdGhyb3cgbmV3IEVycm9yKCdob3VzZWhvbGRJZCByZXF1aXJlZCcpXHJcbiAgICBpZiAoIWlzTmhvc3RDb25maWd1cmVkKCkgfHwgIWlzTmhvc3RBdXRoZW50aWNhdGVkKCkpIHtcclxuICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIHJlYXNvbjogJ05vdCBjb25maWd1cmVkIG9yIG5vdCBhdXRoZW50aWNhdGVkJyB9XHJcbiAgICB9XHJcblxyXG4gICAgLy8gTGFzdCBzeW5jIHBlci1ob3VzZWhvbGRcclxuICAgIGNvbnN0IGxhc3RTeW5jS2V5ID0gYGxhc3RTeW5jOiR7aG91c2Vob2xkSWR9YFxyXG4gICAgY29uc3QgbGFzdFN5bmMgPSAoYXdhaXQgZ2V0U2V0dGluZyhsYXN0U3luY0tleSkpIHx8IG5ldyBEYXRlKDApLnRvSVNPU3RyaW5nKClcclxuXHJcbiAgICBjb25zdCBjaGFuZ2VzID0gYXdhaXQgZ2V0SW52ZW50b3J5Q2hhbmdlc1NpbmNlKGxhc3RTeW5jLCBob3VzZWhvbGRJZClcclxuICAgIGlmICghY2hhbmdlcyB8fCBjaGFuZ2VzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICBhd2FpdCBzZXRTZXR0aW5nKGxhc3RTeW5jS2V5LCBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCkpXHJcbiAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIGFwcGxpZWQ6IDAgfVxyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IGRiID0gYXdhaXQgaW5pdERCKClcclxuICAgIGNvbnN0IHR4ID0gZGIudHJhbnNhY3Rpb24oJ2ludmVudG9yeScsICdyZWFkd3JpdGUnKVxyXG4gICAgbGV0IGFwcGxpZWQgPSAwXHJcblxyXG4gICAgZm9yIChjb25zdCByb3cgb2YgY2hhbmdlcykge1xyXG4gICAgICBjb25zdCBleGlzdGluZyA9IGF3YWl0IHR4LnN0b3JlLmdldChyb3cuaWQpXHJcblxyXG4gICAgICBpZiAocm93Ll9kZWxldGVkKSB7XHJcbiAgICAgICAgaWYgKGV4aXN0aW5nKSB7XHJcbiAgICAgICAgICBleGlzdGluZy5fZGVsZXRlZCA9IHRydWVcclxuICAgICAgICAgIGV4aXN0aW5nLnN5bmNlZEF0ID0gcm93LnVwZGF0ZWRfYXQgfHwgbmV3IERhdGUoKS50b0lTT1N0cmluZygpXHJcbiAgICAgICAgICBhd2FpdCB0eC5zdG9yZS5wdXQoZXhpc3RpbmcpXHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIC8vIGNyZWF0ZSB0b21ic3RvbmVcclxuICAgICAgICAgIGF3YWl0IHR4LnN0b3JlLnB1dCh7XHJcbiAgICAgICAgICAgIGlkOiByb3cuaWQsXHJcbiAgICAgICAgICAgIGhvdXNlaG9sZF9pZDogcm93LmhvdXNlaG9sZF9pZCxcclxuICAgICAgICAgICAgX2RlbGV0ZWQ6IHRydWUsXHJcbiAgICAgICAgICAgIHN5bmNlZEF0OiByb3cudXBkYXRlZF9hdCB8fCBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgICAgICB9KVxyXG4gICAgICAgIH1cclxuICAgICAgICBhcHBsaWVkKytcclxuICAgICAgICBjb250aW51ZVxyXG4gICAgICB9XHJcblxyXG4gICAgICBjb25zdCB0b1B1dCA9IHtcclxuICAgICAgICBpZDogcm93LmlkLFxyXG4gICAgICAgIGhvdXNlaG9sZF9pZDogcm93LmhvdXNlaG9sZF9pZCxcclxuICAgICAgICBwcm9kdWN0SWQ6IHJvdy5wcm9kdWN0X2lkIHx8IG51bGwsXHJcbiAgICAgICAgcXVhbnRpdHk6IHJvdy5xdWFudGl0eSB8fCBudWxsLFxyXG4gICAgICAgIGV4cGlyeURhdGU6IHJvdy5leHBpcnlfZGF0ZSB8fCBudWxsLFxyXG4gICAgICAgIGFkZGVkQXQ6IHJvdy5hZGRlZF9hdCB8fCBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgICAgbGFzdENoZWNrZWRBdDogcm93LnVwZGF0ZWRfYXQgfHwgbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICAgIG5vdGlmaWNhdGlvblNlbnQ6IGZhbHNlLFxyXG4gICAgICAgIHN5bmNlZEF0OiByb3cudXBkYXRlZF9hdCB8fCBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgICAgX2RlbGV0ZWQ6ICEhcm93Ll9kZWxldGVkLFxyXG4gICAgICAgIGFsbG93R3JhY2VQZXJpb2Q6ICEhcm93LmFsbG93R3JhY2VQZXJpb2QsXHJcbiAgICAgICAgZ3JhY2VQZXJpb2RNb250aHM6IHJvdy5ncmFjZVBlcmlvZE1vbnRocyB8fCBudWxsLFxyXG4gICAgICAgIGltYWdlVXJsOiByb3cuaW1hZ2VVcmwgfHwgbnVsbCxcclxuICAgICAgfVxyXG5cclxuICAgICAgYXdhaXQgdHguc3RvcmUucHV0KHsgLi4uZXhpc3RpbmcsIC4uLnRvUHV0IH0pXHJcbiAgICAgIGFwcGxpZWQrK1xyXG4gICAgfVxyXG5cclxuICAgIGF3YWl0IHR4LmRvbmVcclxuXHJcbiAgICAvLyBVcGRhdGUgbGFzdFN5bmMgbWFya2VyXHJcbiAgICBhd2FpdCBzZXRTZXR0aW5nKGxhc3RTeW5jS2V5LCBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCkpXHJcblxyXG4gICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgYXBwbGllZCB9XHJcbiAgfSBjYXRjaCAoZXJyKSB7XHJcbiAgICBjb25zb2xlLmVycm9yKCdmZXRjaEZyb21DbG91ZCBmYWlsZWQ6JywgZXJyKVxyXG4gICAgdGhyb3cgZXJyXHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogRm9yY2UgdXBkYXRlIGludmVudG9yeSBpdGVtIHdpdGhvdXQgcHJlLXdyaXRlIHJlbW90ZSBjaGVjay5cclxuICogVXNlIHRoaXMgd2hlbiB0aGUgdXNlciBleHBsaWNpdGx5IGNob29zZXMgdG8gb3ZlcndyaXRlIHJlbW90ZSBkYXRhLlxyXG4gKi9cclxuZXhwb3J0IGNvbnN0IHVwZGF0ZUludmVudG9yeUl0ZW1Gb3JjZSA9IGFzeW5jIChpZCwgdXBkYXRlcykgPT4ge1xyXG4gIHRyeSB7XHJcbiAgICBjb25zdCBkYiA9IGF3YWl0IGluaXREQigpXHJcbiAgICBjb25zdCB0eCA9IGRiLnRyYW5zYWN0aW9uKCdpbnZlbnRvcnknLCAncmVhZHdyaXRlJylcclxuICAgIGNvbnN0IGl0ZW0gPSBhd2FpdCB0eC5zdG9yZS5nZXQoaWQpXHJcblxyXG4gICAgaWYgKCFpdGVtKSB7XHJcbiAgICAgIHRocm93IG5ldyBFcnJvcihgSW52ZW50b3J5IGl0ZW0gd2l0aCBJRCAke2lkfSBub3QgZm91bmRgKVxyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IHVwZGF0ZWRJdGVtID0ge1xyXG4gICAgICAuLi5pdGVtLFxyXG4gICAgICAuLi51cGRhdGVzLFxyXG4gICAgICBsYXN0Q2hlY2tlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgIHN5bmNlZEF0OiBudWxsLCAvLyBNYXJrIGFzIG5lZWRpbmcgc3luY1xyXG4gICAgfVxyXG5cclxuICAgIGF3YWl0IHR4LnN0b3JlLnB1dCh1cGRhdGVkSXRlbSlcclxuICAgIGF3YWl0IHR4LmRvbmVcclxuXHJcbiAgICAvLyBUcmFjayBjaGFuZ2UgZm9yIHN5bmNcclxuICAgIGF3YWl0IHRyYWNrQ2hhbmdlKCdpbnZlbnRvcnknLCBpZCwgJ3VwZGF0ZScpXHJcblxyXG4gICAgLy8gVHJpZ2dlciBiYWNrZ3JvdW5kIHN5bmMgKGJlc3QtZWZmb3J0KVxyXG4gICAgdHJ5IHtcclxuICAgICAgc3luY1RvQ2xvdWQoKS5jYXRjaCgoZSkgPT4gY29uc29sZS53YXJuKCdCYWNrZ3JvdW5kIHN5bmMgZmFpbGVkOicsIGUubWVzc2FnZSB8fCBlKSlcclxuICAgIH0gY2F0Y2ggKGUpIHtcclxuICAgICAgY29uc29sZS53YXJuKCdGYWlsZWQgdG8gdHJpZ2dlciBiYWNrZ3JvdW5kIHN5bmM6JywgZS5tZXNzYWdlIHx8IGUpXHJcbiAgICB9XHJcbiAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byBmb3JjZSB1cGRhdGUgaW52ZW50b3J5IGl0ZW06JywgZXJyb3IpXHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoYEZhaWxlZCB0byB1cGRhdGUgaW52ZW50b3J5IGl0ZW06ICR7ZXJyb3IubWVzc2FnZX1gKVxyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIEdldCBhIHNpbmdsZSBpbnZlbnRvcnkgaXRlbSBieSBpZCBmcm9tIGxvY2FsIERCXHJcbiAqL1xyXG5leHBvcnQgY29uc3QgZ2V0SW52ZW50b3J5SXRlbSA9IGFzeW5jIChpZCkgPT4ge1xyXG4gIHRyeSB7XHJcbiAgICBjb25zdCBkYiA9IGF3YWl0IGluaXREQigpXHJcbiAgICBjb25zdCBpdGVtID0gYXdhaXQgZGIuZ2V0KCdpbnZlbnRvcnknLCBpZClcclxuICAgIHJldHVybiBpdGVtIHx8IG51bGxcclxuICB9IGNhdGNoIChlcnIpIHtcclxuICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byBnZXQgaW52ZW50b3J5IGl0ZW06JywgZXJyKVxyXG4gICAgdGhyb3cgZXJyXHJcbiAgfVxyXG59Il0sInZlcnNpb24iOjN9