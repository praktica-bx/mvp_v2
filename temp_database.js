import { openDB } from "/node_modules/.vite/deps/idb.js?v=263122e5";
import { isNhostConfigured, isNhostAuthenticated, upsertInventoryBatch, deleteInventoryBatch, getInventoryById, getInventoryChangesSince } from "/src/nhost.js";
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
/**
* Run database migrations
* Ensures database is at the current version
*/
export const runMigrations = async () => {
	try {
		const db = await initDB();
		console.log(`Database initialized at version ${db.version}`);
		return {
			success: true,
			version: db.version
		};
	} catch (error) {
		console.error("Migration failed:", error);
		return {
			success: false,
			error: error.message
		};
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
		// Send upserts
		if (inventoryUpserts.length > 0) {
			const res = await upsertInventoryBatch(inventoryUpserts);
			syncedCount += res.length || 0;
			// Mark local logs as synced
			for (const up of inventoryUpserts) {
				await markSynced("inventory", up.id);
			}
		}
		// Send deletes
		if (inventoryDeletes.length > 0) {
			const delRes = await deleteInventoryBatch(inventoryDeletes);
			syncedCount += inventoryDeletes.length;
			for (const id of inventoryDeletes) {
				await markSynced("inventory", id);
			}
		}
		// Update last sync setting (global)
		await setSetting("lastSync", new Date().toISOString());
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

//# sourceMappingURL=data:application/json;base64,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V0FBUSxLQUFLLHNDQUFzQyxFQUFFLFdBQVcsRUFBRTs7VUFFN0QsT0FBTztBQUNkLFVBQVEsTUFBTSwwQ0FBMEMsTUFBTTtBQUM5RCxRQUFNLElBQUksTUFBTSxvQ0FBb0MsTUFBTSxVQUFVOzs7Ozs7QUFPeEUsT0FBTyxNQUFNLG1CQUFtQixPQUFPLE9BQU87QUFDNUMsS0FBSTtFQUNGLE1BQU0sS0FBSyxNQUFNLFFBQVE7RUFDekIsTUFBTSxPQUFPLE1BQU0sR0FBRyxJQUFJLGFBQWEsR0FBRztBQUMxQyxTQUFPLFFBQVE7VUFDUixLQUFLO0FBQ1osVUFBUSxNQUFNLGlDQUFpQyxJQUFJO0FBQ25ELFFBQU0iLCJuYW1lcyI6W10sInNvdXJjZXMiOlsiZGF0YWJhc2UuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgb3BlbkRCIH0gZnJvbSAnaWRiJ1xyXG5pbXBvcnQge1xyXG4gIGlzTmhvc3RDb25maWd1cmVkLFxyXG4gIGlzTmhvc3RBdXRoZW50aWNhdGVkLFxyXG4gIHVwc2VydEludmVudG9yeUJhdGNoLFxyXG4gIGRlbGV0ZUludmVudG9yeUJhdGNoLFxyXG4gIGdldEludmVudG9yeUJ5SWQsXHJcbiAgZ2V0SW52ZW50b3J5Q2hhbmdlc1NpbmNlLFxyXG59IGZyb20gJy4vbmhvc3QnXHJcblxyXG4vLyBSZS1leHBvcnQgbmhvc3QgaGVscGVyIHNvIGNvbnN1bWVycyBjYW4gaW1wb3J0IGZyb20gYC4uL2RhdGFiYXNlYFxyXG5leHBvcnQgeyBnZXRJbnZlbnRvcnlCeUlkIH1cclxuXHJcbmNvbnN0IERCX05BTUUgPSAnZW1lcmdlbmN5LXN1cHBseS1kYidcclxuY29uc3QgREJfVkVSU0lPTiA9IDggLy8gdjggYWRkcyBob3VzZWhvbGRfaWQgdG8gaW52ZW50b3J5IGFuZCBvdGhlciBzdG9yZXNcclxuXHJcbmNvbnN0IERFRkFVTFRfQ0FURUdPUklFUyA9IFtcclxuICB7IHNsdWc6ICdmb29kJywgbmFtZTogJ0Zvb2QnIH0sXHJcbiAgeyBzbHVnOiAnd2F0ZXInLCBuYW1lOiAnV2F0ZXInIH0sXHJcbiAgeyBzbHVnOiAnbWVkcycsIG5hbWU6ICdNZWRpY2F0aW9ucycgfSxcclxuICB7IHNsdWc6ICdiYXR0ZXJpZXNQb3dlcicsIG5hbWU6ICdCYXR0ZXJpZXMgJiBQb3dlcicgfSxcclxuICB7IHNsdWc6ICdoZWF0aW5nJywgbmFtZTogJ0hlYXRpbmcnIH0sXHJcbiAgeyBzbHVnOiAnbGlnaHQnLCBuYW1lOiAnTGlnaHQnIH0sXHJcbiAgeyBzbHVnOiAnaHlnaWVuZScsIG5hbWU6ICdIeWdpZW5lJyB9LFxyXG4gIHsgc2x1ZzogJ2ZpcnN0QWlkJywgbmFtZTogJ0ZpcnN0IEFpZCcgfSxcclxuICB7IHNsdWc6ICd0b29scycsIG5hbWU6ICdUb29scyAmIEVxdWlwbWVudCcgfSxcclxuICB7IHNsdWc6ICdvdGhlcicsIG5hbWU6ICdPdGhlcicgfSxcclxuXVxyXG5cclxuZXhwb3J0IGNvbnN0IENBVEVHT1JZX0RFRkFVTFRTID0gREVGQVVMVF9DQVRFR09SSUVTXHJcblxyXG4vKipcclxuICogSW5pdGlhbGl6ZSBkYXRhYmFzZSB3aXRoIG1pZ3JhdGlvbiBzdXBwb3J0XHJcbiAqIFNjaGVtYSB2MyBpbmNsdWRlcyBzeW5jIHRyYWNraW5nIGFuZCBlbmhhbmNlZCBmaWVsZHNcclxuICovXHJcbmNvbnN0IGluaXREQiA9IGFzeW5jICgpID0+IHtcclxuICB0cnkge1xyXG4gICAgcmV0dXJuIGF3YWl0IG9wZW5EQihEQl9OQU1FLCBEQl9WRVJTSU9OLCB7XHJcbiAgICAgIHVwZ3JhZGUoZGIsIG9sZFZlcnNpb24sIG5ld1ZlcnNpb24sIHRyYW5zYWN0aW9uKSB7XHJcbiAgICAgICAgY29uc29sZS5sb2coYFVwZ3JhZGluZyBkYXRhYmFzZSBmcm9tIHYke29sZFZlcnNpb259IHRvIHYke25ld1ZlcnNpb259YClcclxuXHJcbiAgICAgICAgLy8gTWlncmF0aW9uIGZyb20gdjAgKG5vIGRhdGFiYXNlKSBvciB2MSB0byBjdXJyZW50XHJcbiAgICAgICAgaWYgKG9sZFZlcnNpb24gPCAxKSB7XHJcbiAgICAgICAgICAvLyBDcmVhdGUgcHJvZHVjdHMgc3RvcmVcclxuICAgICAgICAgIGlmICghZGIub2JqZWN0U3RvcmVOYW1lcy5jb250YWlucygncHJvZHVjdHMnKSkge1xyXG4gICAgICAgICAgICBjb25zdCBwcm9kdWN0U3RvcmUgPSBkYi5jcmVhdGVPYmplY3RTdG9yZSgncHJvZHVjdHMnLCB7XHJcbiAgICAgICAgICAgICAga2V5UGF0aDogJ2lkJyxcclxuICAgICAgICAgICAgICBhdXRvSW5jcmVtZW50OiB0cnVlLFxyXG4gICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICBwcm9kdWN0U3RvcmUuY3JlYXRlSW5kZXgoJ25hbWUnLCAnbmFtZScsIHsgdW5pcXVlOiBmYWxzZSB9KVxyXG4gICAgICAgICAgICBwcm9kdWN0U3RvcmUuY3JlYXRlSW5kZXgoJ25vcm1hbGl6ZWROYW1lJywgJ25vcm1hbGl6ZWROYW1lJywgeyB1bmlxdWU6IGZhbHNlIH0pXHJcbiAgICAgICAgICAgIHByb2R1Y3RTdG9yZS5jcmVhdGVJbmRleCgnYmFyY29kZScsICdiYXJjb2RlJywgeyB1bmlxdWU6IGZhbHNlIH0pXHJcbiAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgLy8gQ3JlYXRlIGludmVudG9yeSBzdG9yZVxyXG4gICAgICAgICAgaWYgKCFkYi5vYmplY3RTdG9yZU5hbWVzLmNvbnRhaW5zKCdpbnZlbnRvcnknKSkge1xyXG4gICAgICAgICAgICBjb25zdCBpbnZlbnRvcnlTdG9yZSA9IGRiLmNyZWF0ZU9iamVjdFN0b3JlKCdpbnZlbnRvcnknLCB7XHJcbiAgICAgICAgICAgICAga2V5UGF0aDogJ2lkJyxcclxuICAgICAgICAgICAgICBhdXRvSW5jcmVtZW50OiB0cnVlLFxyXG4gICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICBpbnZlbnRvcnlTdG9yZS5jcmVhdGVJbmRleCgncHJvZHVjdElkJywgJ3Byb2R1Y3RJZCcsIHsgdW5pcXVlOiBmYWxzZSB9KVxyXG4gICAgICAgICAgICBpbnZlbnRvcnlTdG9yZS5jcmVhdGVJbmRleCgnZXhwaXJ5RGF0ZScsICdleHBpcnlEYXRlJywgeyB1bmlxdWU6IGZhbHNlIH0pXHJcbiAgICAgICAgICAgIGludmVudG9yeVN0b3JlLmNyZWF0ZUluZGV4KCdjYXRlZ29yeScsICdjYXRlZ29yeScsIHsgdW5pcXVlOiBmYWxzZSB9KVxyXG4gICAgICAgICAgfVxyXG5cclxuICAgICAgICAgIC8vIENyZWF0ZSBzZXR0aW5ncyBzdG9yZVxyXG4gICAgICAgICAgaWYgKCFkYi5vYmplY3RTdG9yZU5hbWVzLmNvbnRhaW5zKCdzZXR0aW5ncycpKSB7XHJcbiAgICAgICAgICAgIGRiLmNyZWF0ZU9iamVjdFN0b3JlKCdzZXR0aW5ncycsIHsga2V5UGF0aDogJ2tleScgfSlcclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIE1pZ3JhdGlvbiBmcm9tIHYxIHRvIHYyXHJcbiAgICAgICAgaWYgKG9sZFZlcnNpb24gPCAyKSB7XHJcbiAgICAgICAgICAvLyBBZGQgYmFyY29kZSBpbmRleCBpZiBtaXNzaW5nXHJcbiAgICAgICAgICBpZiAoZGIub2JqZWN0U3RvcmVOYW1lcy5jb250YWlucygncHJvZHVjdHMnKSkge1xyXG4gICAgICAgICAgICBjb25zdCBwcm9kdWN0U3RvcmUgPSB0cmFuc2FjdGlvbi5vYmplY3RTdG9yZSgncHJvZHVjdHMnKVxyXG4gICAgICAgICAgICBpZiAoIXByb2R1Y3RTdG9yZS5pbmRleE5hbWVzLmNvbnRhaW5zKCdiYXJjb2RlJykpIHtcclxuICAgICAgICAgICAgICBwcm9kdWN0U3RvcmUuY3JlYXRlSW5kZXgoJ2JhcmNvZGUnLCAnYmFyY29kZScsIHsgdW5pcXVlOiBmYWxzZSB9KVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBNaWdyYXRpb24gZnJvbSB2MiB0byB2MyAtIEFkZCBzeW5jIHRyYWNraW5nXHJcbiAgICAgICAgaWYgKG9sZFZlcnNpb24gPCAzKSB7XHJcbiAgICAgICAgICAvLyBDcmVhdGUgc3luY19sb2cgc3RvcmUgZm9yIHRyYWNraW5nIGNoYW5nZXNcclxuICAgICAgICAgIGlmICghZGIub2JqZWN0U3RvcmVOYW1lcy5jb250YWlucygnc3luY19sb2cnKSkge1xyXG4gICAgICAgICAgICBjb25zdCBzeW5jU3RvcmUgPSBkYi5jcmVhdGVPYmplY3RTdG9yZSgnc3luY19sb2cnLCB7XHJcbiAgICAgICAgICAgICAga2V5UGF0aDogJ2lkJyxcclxuICAgICAgICAgICAgICBhdXRvSW5jcmVtZW50OiB0cnVlLFxyXG4gICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICBzeW5jU3RvcmUuY3JlYXRlSW5kZXgoJ3RhYmxlJywgJ3RhYmxlJywgeyB1bmlxdWU6IGZhbHNlIH0pXHJcbiAgICAgICAgICAgIHN5bmNTdG9yZS5jcmVhdGVJbmRleCgncmVjb3JkSWQnLCAncmVjb3JkSWQnLCB7IHVuaXF1ZTogZmFsc2UgfSlcclxuICAgICAgICAgICAgc3luY1N0b3JlLmNyZWF0ZUluZGV4KCdzeW5jZWQnLCAnc3luY2VkJywgeyB1bmlxdWU6IGZhbHNlIH0pXHJcbiAgICAgICAgICAgIHN5bmNTdG9yZS5jcmVhdGVJbmRleCgndGltZXN0YW1wJywgJ3RpbWVzdGFtcCcsIHsgdW5pcXVlOiBmYWxzZSB9KVxyXG4gICAgICAgICAgfVxyXG5cclxuICAgICAgICAgIC8vIEFkZCBzeW5jLXJlbGF0ZWQgaW5kZXhlcyB0byBleGlzdGluZyBzdG9yZXNcclxuICAgICAgICAgIGlmIChkYi5vYmplY3RTdG9yZU5hbWVzLmNvbnRhaW5zKCdwcm9kdWN0cycpKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHByb2R1Y3RTdG9yZSA9IHRyYW5zYWN0aW9uLm9iamVjdFN0b3JlKCdwcm9kdWN0cycpXHJcbiAgICAgICAgICAgIGlmICghcHJvZHVjdFN0b3JlLmluZGV4TmFtZXMuY29udGFpbnMoJ3N5bmNlZEF0JykpIHtcclxuICAgICAgICAgICAgICBwcm9kdWN0U3RvcmUuY3JlYXRlSW5kZXgoJ3N5bmNlZEF0JywgJ3N5bmNlZEF0JywgeyB1bmlxdWU6IGZhbHNlIH0pXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgaWYgKCFwcm9kdWN0U3RvcmUuaW5kZXhOYW1lcy5jb250YWlucygnX2RlbGV0ZWQnKSkge1xyXG4gICAgICAgICAgICAgIHByb2R1Y3RTdG9yZS5jcmVhdGVJbmRleCgnX2RlbGV0ZWQnLCAnX2RlbGV0ZWQnLCB7IHVuaXF1ZTogZmFsc2UgfSlcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfVxyXG5cclxuICAgICAgICAgIGlmIChkYi5vYmplY3RTdG9yZU5hbWVzLmNvbnRhaW5zKCdpbnZlbnRvcnknKSkge1xyXG4gICAgICAgICAgICBjb25zdCBpbnZlbnRvcnlTdG9yZSA9IHRyYW5zYWN0aW9uLm9iamVjdFN0b3JlKCdpbnZlbnRvcnknKVxyXG4gICAgICAgICAgICBpZiAoIWludmVudG9yeVN0b3JlLmluZGV4TmFtZXMuY29udGFpbnMoJ3N5bmNlZEF0JykpIHtcclxuICAgICAgICAgICAgICBpbnZlbnRvcnlTdG9yZS5jcmVhdGVJbmRleCgnc3luY2VkQXQnLCAnc3luY2VkQXQnLCB7IHVuaXF1ZTogZmFsc2UgfSlcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBpZiAoIWludmVudG9yeVN0b3JlLmluZGV4TmFtZXMuY29udGFpbnMoJ19kZWxldGVkJykpIHtcclxuICAgICAgICAgICAgICBpbnZlbnRvcnlTdG9yZS5jcmVhdGVJbmRleCgnX2RlbGV0ZWQnLCAnX2RlbGV0ZWQnLCB7IHVuaXF1ZTogZmFsc2UgfSlcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfVxyXG5cclxuICAgICAgICAgIGlmIChkYi5vYmplY3RTdG9yZU5hbWVzLmNvbnRhaW5zKCdzZXR0aW5ncycpKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHNldHRpbmdzU3RvcmUgPSB0cmFuc2FjdGlvbi5vYmplY3RTdG9yZSgnc2V0dGluZ3MnKVxyXG4gICAgICAgICAgICBpZiAoIXNldHRpbmdzU3RvcmUuaW5kZXhOYW1lcy5jb250YWlucygnc3luY2VkQXQnKSkge1xyXG4gICAgICAgICAgICAgIHNldHRpbmdzU3RvcmUuY3JlYXRlSW5kZXgoJ3N5bmNlZEF0JywgJ3N5bmNlZEF0JywgeyB1bmlxdWU6IGZhbHNlIH0pXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAvLyBNaWdyYXRlIGV4aXN0aW5nIGRhdGEgdG8gYWRkIG5ldyBmaWVsZHNcclxuICAgICAgICAgIGNvbnN0IHByb2R1Y3RTdG9yZSA9IHRyYW5zYWN0aW9uLm9iamVjdFN0b3JlKCdwcm9kdWN0cycpXHJcbiAgICAgICAgICBjb25zdCBpbnZlbnRvcnlTdG9yZSA9IHRyYW5zYWN0aW9uLm9iamVjdFN0b3JlKCdpbnZlbnRvcnknKVxyXG5cclxuICAgICAgICAgIC8vIEFkZCB0aW1lc3RhbXBzIHRvIGV4aXN0aW5nIHByb2R1Y3RzXHJcbiAgICAgICAgICBwcm9kdWN0U3RvcmUub3BlbkN1cnNvcigpLm9uc3VjY2VzcyA9IChldmVudCkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBjdXJzb3IgPSBldmVudC50YXJnZXQucmVzdWx0XHJcbiAgICAgICAgICAgIGlmIChjdXJzb3IpIHtcclxuICAgICAgICAgICAgICBjb25zdCBwcm9kdWN0ID0gY3Vyc29yLnZhbHVlXHJcbiAgICAgICAgICAgICAgaWYgKCFwcm9kdWN0LmNyZWF0ZWRBdCkgcHJvZHVjdC5jcmVhdGVkQXQgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKClcclxuICAgICAgICAgICAgICBpZiAoIXByb2R1Y3QudXBkYXRlZEF0KSBwcm9kdWN0LnVwZGF0ZWRBdCA9IHByb2R1Y3QuY3JlYXRlZEF0XHJcbiAgICAgICAgICAgICAgcHJvZHVjdC5zeW5jZWRBdCA9IG51bGxcclxuICAgICAgICAgICAgICBwcm9kdWN0Ll9kZWxldGVkID0gZmFsc2VcclxuICAgICAgICAgICAgICBjdXJzb3IudXBkYXRlKHByb2R1Y3QpXHJcbiAgICAgICAgICAgICAgY3Vyc29yLmNvbnRpbnVlKClcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfVxyXG5cclxuICAgICAgICAgIC8vIEFkZCB0aW1lc3RhbXBzIHRvIGV4aXN0aW5nIGludmVudG9yeSBpdGVtc1xyXG4gICAgICAgICAgaW52ZW50b3J5U3RvcmUub3BlbkN1cnNvcigpLm9uc3VjY2VzcyA9IChldmVudCkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBjdXJzb3IgPSBldmVudC50YXJnZXQucmVzdWx0XHJcbiAgICAgICAgICAgIGlmIChjdXJzb3IpIHtcclxuICAgICAgICAgICAgICBjb25zdCBpdGVtID0gY3Vyc29yLnZhbHVlXHJcbiAgICAgICAgICAgICAgaWYgKCFpdGVtLmFkZGVkQXQpIGl0ZW0uYWRkZWRBdCA9IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKVxyXG4gICAgICAgICAgICAgIGl0ZW0ubGFzdENoZWNrZWRBdCA9IGl0ZW0uYWRkZWRBdFxyXG4gICAgICAgICAgICAgIGl0ZW0ubm90aWZpY2F0aW9uU2VudCA9IGZhbHNlXHJcbiAgICAgICAgICAgICAgaXRlbS5zeW5jZWRBdCA9IG51bGxcclxuICAgICAgICAgICAgICBpdGVtLl9kZWxldGVkID0gZmFsc2VcclxuICAgICAgICAgICAgICBjdXJzb3IudXBkYXRlKGl0ZW0pXHJcbiAgICAgICAgICAgICAgY3Vyc29yLmNvbnRpbnVlKClcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gTWlncmF0aW9uIGZyb20gdjMgdG8gdjQgLSBBZGQgY2F0YWxvZyBzdG9yZXNcclxuICAgICAgICBpZiAob2xkVmVyc2lvbiA8IDQpIHtcclxuICAgICAgICAgIC8vIENyZWF0ZSBwcm9kdWN0c19jYXRhbG9nIHN0b3JlIGZvciBPcGVuIEZvb2QgRmFjdHMgZGF0YVxyXG4gICAgICAgICAgaWYgKCFkYi5vYmplY3RTdG9yZU5hbWVzLmNvbnRhaW5zKCdwcm9kdWN0c19jYXRhbG9nJykpIHtcclxuICAgICAgICAgICAgY29uc3QgY2F0YWxvZ1N0b3JlID0gZGIuY3JlYXRlT2JqZWN0U3RvcmUoJ3Byb2R1Y3RzX2NhdGFsb2cnLCB7XHJcbiAgICAgICAgICAgICAga2V5UGF0aDogJ2lkJyxcclxuICAgICAgICAgICAgICBhdXRvSW5jcmVtZW50OiB0cnVlLFxyXG4gICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICBjYXRhbG9nU3RvcmUuY3JlYXRlSW5kZXgoJ2JhcmNvZGUnLCAnYmFyY29kZScsIHsgdW5pcXVlOiB0cnVlIH0pXHJcbiAgICAgICAgICAgIGNhdGFsb2dTdG9yZS5jcmVhdGVJbmRleCgnbmFtZScsICduYW1lJywgeyB1bmlxdWU6IGZhbHNlIH0pXHJcbiAgICAgICAgICAgIGNhdGFsb2dTdG9yZS5jcmVhdGVJbmRleCgnbm9ybWFsaXplZE5hbWUnLCAnbm9ybWFsaXplZE5hbWUnLCB7IHVuaXF1ZTogZmFsc2UgfSlcclxuICAgICAgICAgICAgY2F0YWxvZ1N0b3JlLmNyZWF0ZUluZGV4KCdjYXRlZ29yeScsICdjYXRlZ29yeScsIHsgdW5pcXVlOiBmYWxzZSB9KVxyXG4gICAgICAgICAgICBjYXRhbG9nU3RvcmUuY3JlYXRlSW5kZXgoJ2JyYW5kJywgJ2JyYW5kJywgeyB1bmlxdWU6IGZhbHNlIH0pXHJcbiAgICAgICAgICAgIGNhdGFsb2dTdG9yZS5jcmVhdGVJbmRleCgnc291cmNlJywgJ3NvdXJjZScsIHsgdW5pcXVlOiBmYWxzZSB9KVxyXG4gICAgICAgICAgICBjYXRhbG9nU3RvcmUuY3JlYXRlSW5kZXgoJ3VwZGF0ZWRBdCcsICd1cGRhdGVkQXQnLCB7IHVuaXF1ZTogZmFsc2UgfSlcclxuICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAvLyBDcmVhdGUgcHJvZHVjdHNfdXNlciBzdG9yZSBmb3IgdXNlci1jdXN0b21pemVkIHRlbXBsYXRlc1xyXG4gICAgICAgICAgaWYgKCFkYi5vYmplY3RTdG9yZU5hbWVzLmNvbnRhaW5zKCdwcm9kdWN0c191c2VyJykpIHtcclxuICAgICAgICAgICAgY29uc3QgdXNlclN0b3JlID0gZGIuY3JlYXRlT2JqZWN0U3RvcmUoJ3Byb2R1Y3RzX3VzZXInLCB7XHJcbiAgICAgICAgICAgICAga2V5UGF0aDogJ2lkJyxcclxuICAgICAgICAgICAgICBhdXRvSW5jcmVtZW50OiB0cnVlLFxyXG4gICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICB1c2VyU3RvcmUuY3JlYXRlSW5kZXgoJ2JhcmNvZGUnLCAnYmFyY29kZScsIHsgdW5pcXVlOiBmYWxzZSB9KVxyXG4gICAgICAgICAgICB1c2VyU3RvcmUuY3JlYXRlSW5kZXgoJ25hbWUnLCAnbmFtZScsIHsgdW5pcXVlOiBmYWxzZSB9KVxyXG4gICAgICAgICAgICB1c2VyU3RvcmUuY3JlYXRlSW5kZXgoJ25vcm1hbGl6ZWROYW1lJywgJ25vcm1hbGl6ZWROYW1lJywgeyB1bmlxdWU6IGZhbHNlIH0pXHJcbiAgICAgICAgICAgIHVzZXJTdG9yZS5jcmVhdGVJbmRleCgnY2F0ZWdvcnknLCAnY2F0ZWdvcnknLCB7IHVuaXF1ZTogZmFsc2UgfSlcclxuICAgICAgICAgICAgdXNlclN0b3JlLmNyZWF0ZUluZGV4KCd1c2FnZUNvdW50JywgJ3VzYWdlQ291bnQnLCB7IHVuaXF1ZTogZmFsc2UgfSlcclxuICAgICAgICAgICAgdXNlclN0b3JlLmNyZWF0ZUluZGV4KCdsYXN0VXNlZEF0JywgJ2xhc3RVc2VkQXQnLCB7IHVuaXF1ZTogZmFsc2UgfSlcclxuICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAvLyBDcmVhdGUgcHJvZHVjdHNfaW5kZXggZm9yIGZhc3Qgc2VhcmNoXHJcbiAgICAgICAgICBpZiAoIWRiLm9iamVjdFN0b3JlTmFtZXMuY29udGFpbnMoJ3Byb2R1Y3RzX2luZGV4JykpIHtcclxuICAgICAgICAgICAgY29uc3QgaW5kZXhTdG9yZSA9IGRiLmNyZWF0ZU9iamVjdFN0b3JlKCdwcm9kdWN0c19pbmRleCcsIHtcclxuICAgICAgICAgICAgICBrZXlQYXRoOiAnaWQnLFxyXG4gICAgICAgICAgICAgIGF1dG9JbmNyZW1lbnQ6IHRydWUsXHJcbiAgICAgICAgICAgIH0pXHJcbiAgICAgICAgICAgIGluZGV4U3RvcmUuY3JlYXRlSW5kZXgoJ3NlYXJjaEtleScsICdzZWFyY2hLZXknLCB7IHVuaXF1ZTogZmFsc2UgfSlcclxuICAgICAgICAgICAgaW5kZXhTdG9yZS5jcmVhdGVJbmRleCgncHJvZHVjdElkJywgJ3Byb2R1Y3RJZCcsIHsgdW5pcXVlOiBmYWxzZSB9KVxyXG4gICAgICAgICAgICBpbmRleFN0b3JlLmNyZWF0ZUluZGV4KCdzb3VyY2VUYWJsZScsICdzb3VyY2VUYWJsZScsIHsgdW5pcXVlOiBmYWxzZSB9KVxyXG4gICAgICAgICAgICBpbmRleFN0b3JlLmNyZWF0ZUluZGV4KCdzY29yZScsICdzY29yZScsIHsgdW5pcXVlOiBmYWxzZSB9KVxyXG4gICAgICAgICAgfVxyXG5cclxuICAgICAgICAgIC8vIENyZWF0ZSBjYXRhbG9nX21ldGFkYXRhIGZvciB2ZXJzaW9uIHRyYWNraW5nXHJcbiAgICAgICAgICBpZiAoIWRiLm9iamVjdFN0b3JlTmFtZXMuY29udGFpbnMoJ2NhdGFsb2dfbWV0YWRhdGEnKSkge1xyXG4gICAgICAgICAgICBkYi5jcmVhdGVPYmplY3RTdG9yZSgnY2F0YWxvZ19tZXRhZGF0YScsIHsga2V5UGF0aDogJ2tleScgfSlcclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIE1pZ3JhdGlvbiBmcm9tIHY0IHRvIHY1IC0gQWRkIGNvbnN1bXB0aW9uIHRyYWNraW5nIGFuZCBzaG9wcGluZyBsaXN0XHJcbiAgICAgICAgaWYgKG9sZFZlcnNpb24gPCA1KSB7XHJcbiAgICAgICAgICAvLyBDcmVhdGUgY29uc3VtcHRpb25fbG9nIHN0b3JlXHJcbiAgICAgICAgICBpZiAoIWRiLm9iamVjdFN0b3JlTmFtZXMuY29udGFpbnMoJ2NvbnN1bXB0aW9uX2xvZycpKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNvbnN1bXB0aW9uU3RvcmUgPSBkYi5jcmVhdGVPYmplY3RTdG9yZSgnY29uc3VtcHRpb25fbG9nJywge1xyXG4gICAgICAgICAgICAgIGtleVBhdGg6ICdpZCcsXHJcbiAgICAgICAgICAgIH0pXHJcbiAgICAgICAgICAgIGNvbnN1bXB0aW9uU3RvcmUuY3JlYXRlSW5kZXgoJ2ludmVudG9yeV9pZCcsICdpbnZlbnRvcnlfaWQnLCB7IHVuaXF1ZTogZmFsc2UgfSlcclxuICAgICAgICAgICAgY29uc3VtcHRpb25TdG9yZS5jcmVhdGVJbmRleCgncHJvZHVjdF9pZCcsICdwcm9kdWN0X2lkJywgeyB1bmlxdWU6IGZhbHNlIH0pXHJcbiAgICAgICAgICAgIGNvbnN1bXB0aW9uU3RvcmUuY3JlYXRlSW5kZXgoJ2NvbnN1bWVkX2F0JywgJ2NvbnN1bWVkX2F0JywgeyB1bmlxdWU6IGZhbHNlIH0pXHJcbiAgICAgICAgICAgIGNvbnN1bXB0aW9uU3RvcmUuY3JlYXRlSW5kZXgoJ2NhdGVnb3J5JywgJ2NhdGVnb3J5JywgeyB1bmlxdWU6IGZhbHNlIH0pXHJcbiAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgLy8gQ3JlYXRlIHNob3BwaW5nX2xpc3Qgc3RvcmVcclxuICAgICAgICAgIGlmICghZGIub2JqZWN0U3RvcmVOYW1lcy5jb250YWlucygnc2hvcHBpbmdfbGlzdCcpKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHNob3BwaW5nU3RvcmUgPSBkYi5jcmVhdGVPYmplY3RTdG9yZSgnc2hvcHBpbmdfbGlzdCcsIHtcclxuICAgICAgICAgICAgICBrZXlQYXRoOiAnaWQnLFxyXG4gICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICBzaG9wcGluZ1N0b3JlLmNyZWF0ZUluZGV4KCdwcm9kdWN0X2lkJywgJ3Byb2R1Y3RfaWQnLCB7IHVuaXF1ZTogZmFsc2UgfSlcclxuICAgICAgICAgICAgc2hvcHBpbmdTdG9yZS5jcmVhdGVJbmRleCgnY2F0ZWdvcnknLCAnY2F0ZWdvcnknLCB7IHVuaXF1ZTogZmFsc2UgfSlcclxuICAgICAgICAgICAgc2hvcHBpbmdTdG9yZS5jcmVhdGVJbmRleCgncHJpb3JpdHknLCAncHJpb3JpdHknLCB7IHVuaXF1ZTogZmFsc2UgfSlcclxuICAgICAgICAgICAgc2hvcHBpbmdTdG9yZS5jcmVhdGVJbmRleCgncHVyY2hhc2VkJywgJ3B1cmNoYXNlZCcsIHsgdW5pcXVlOiBmYWxzZSB9KVxyXG4gICAgICAgICAgICBzaG9wcGluZ1N0b3JlLmNyZWF0ZUluZGV4KCdjcmVhdGVkX2F0JywgJ2NyZWF0ZWRfYXQnLCB7IHVuaXF1ZTogZmFsc2UgfSlcclxuICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAvLyBDcmVhdGUgYWNoaWV2ZW1lbnRzIHN0b3JlXHJcbiAgICAgICAgICBpZiAoIWRiLm9iamVjdFN0b3JlTmFtZXMuY29udGFpbnMoJ2FjaGlldmVtZW50cycpKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGFjaGlldmVtZW50U3RvcmUgPSBkYi5jcmVhdGVPYmplY3RTdG9yZSgnYWNoaWV2ZW1lbnRzJywge1xyXG4gICAgICAgICAgICAgIGtleVBhdGg6ICdpZCcsXHJcbiAgICAgICAgICAgIH0pXHJcbiAgICAgICAgICAgIGFjaGlldmVtZW50U3RvcmUuY3JlYXRlSW5kZXgoJ3VubG9ja2VkX2F0JywgJ3VubG9ja2VkX2F0JywgeyB1bmlxdWU6IGZhbHNlIH0pXHJcbiAgICAgICAgICAgIGFjaGlldmVtZW50U3RvcmUuY3JlYXRlSW5kZXgoJ3R5cGUnLCAndHlwZScsIHsgdW5pcXVlOiBmYWxzZSB9KVxyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gTWlncmF0aW9uIGZyb20gdjUgdG8gdjYgLSBBZGQgYWxlcnRzIHNldHRpbmdzIHN0b3JlXHJcbiAgICAgICAgaWYgKG9sZFZlcnNpb24gPCA2KSB7XHJcbiAgICAgICAgICBpZiAoIWRiLm9iamVjdFN0b3JlTmFtZXMuY29udGFpbnMoJ2FsZXJ0c19zZXR0aW5ncycpKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGFsZXJ0c1N0b3JlID0gZGIuY3JlYXRlT2JqZWN0U3RvcmUoJ2FsZXJ0c19zZXR0aW5ncycsIHsga2V5UGF0aDogJ2lkJyB9KVxyXG4gICAgICAgICAgICBhbGVydHNTdG9yZS5jcmVhdGVJbmRleCgnZW5hYmxlZCcsICdlbmFibGVkJywgeyB1bmlxdWU6IGZhbHNlIH0pXHJcbiAgICAgICAgICAgIGFsZXJ0c1N0b3JlLmNyZWF0ZUluZGV4KCdjaGFubmVsJywgJ2NoYW5uZWwnLCB7IHVuaXF1ZTogZmFsc2UgfSlcclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIE1pZ3JhdGlvbiBmcm9tIHY2IHRvIHY3IC0gQ2F0ZWdvcmllcyBzdG9yZVxyXG4gICAgICAgIGlmIChvbGRWZXJzaW9uIDwgNykge1xyXG4gICAgICAgICAgaWYgKCFkYi5vYmplY3RTdG9yZU5hbWVzLmNvbnRhaW5zKCdjYXRlZ29yaWVzJykpIHtcclxuICAgICAgICAgICAgY29uc3QgY2F0ZWdvcmllc1N0b3JlID0gZGIuY3JlYXRlT2JqZWN0U3RvcmUoJ2NhdGVnb3JpZXMnLCB7XHJcbiAgICAgICAgICAgICAga2V5UGF0aDogJ2lkJyxcclxuICAgICAgICAgICAgICBhdXRvSW5jcmVtZW50OiB0cnVlLFxyXG4gICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICBjYXRlZ29yaWVzU3RvcmUuY3JlYXRlSW5kZXgoJ3NsdWcnLCAnc2x1ZycsIHsgdW5pcXVlOiB0cnVlIH0pXHJcbiAgICAgICAgICAgIGNhdGVnb3JpZXNTdG9yZS5jcmVhdGVJbmRleCgnbm9ybWFsaXplZE5hbWUnLCAnbm9ybWFsaXplZE5hbWUnLCB7IHVuaXF1ZTogdHJ1ZSB9KVxyXG4gICAgICAgICAgICBjYXRlZ29yaWVzU3RvcmUuY3JlYXRlSW5kZXgoJ2FyY2hpdmVkJywgJ2FyY2hpdmVkJywgeyB1bmlxdWU6IGZhbHNlIH0pXHJcblxyXG4gICAgICAgICAgICBERUZBVUxUX0NBVEVHT1JJRVMuZm9yRWFjaCgoY2F0KSA9PiB7XHJcbiAgICAgICAgICAgICAgY2F0ZWdvcmllc1N0b3JlLmFkZCh7XHJcbiAgICAgICAgICAgICAgICAuLi5jYXQsXHJcbiAgICAgICAgICAgICAgICBub3JtYWxpemVkTmFtZTogbm9ybWFsaXplVGV4dChjYXQubmFtZSksXHJcbiAgICAgICAgICAgICAgICBhcmNoaXZlZDogZmFsc2UsXHJcbiAgICAgICAgICAgICAgICBjcmVhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgICAgICAgICAgIHVwZGF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICAgICAgICAgIH0pXHJcbiAgICAgICAgICAgIH0pXHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBNaWdyYXRpb24gZnJvbSB2NyB0byB2OCAtIEFkZCBob3VzZWhvbGRfaWQgc3VwcG9ydFxyXG4gICAgICAgIGlmIChvbGRWZXJzaW9uIDwgOCkge1xyXG4gICAgICAgICAgLy8gQWRkIGhvdXNlaG9sZF9pZCBpbmRleCB0byBpbnZlbnRvcnkgc3RvcmVcclxuICAgICAgICAgIGlmIChkYi5vYmplY3RTdG9yZU5hbWVzLmNvbnRhaW5zKCdpbnZlbnRvcnknKSkge1xyXG4gICAgICAgICAgICBjb25zdCBpbnZlbnRvcnlTdG9yZSA9IHRyYW5zYWN0aW9uLm9iamVjdFN0b3JlKCdpbnZlbnRvcnknKVxyXG4gICAgICAgICAgICBpZiAoIWludmVudG9yeVN0b3JlLmluZGV4TmFtZXMuY29udGFpbnMoJ2hvdXNlaG9sZF9pZCcpKSB7XHJcbiAgICAgICAgICAgICAgaW52ZW50b3J5U3RvcmUuY3JlYXRlSW5kZXgoJ2hvdXNlaG9sZF9pZCcsICdob3VzZWhvbGRfaWQnLCB7IHVuaXF1ZTogZmFsc2UgfSlcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfVxyXG5cclxuICAgICAgICAgIC8vIEFkZCBob3VzZWhvbGRfaWQgaW5kZXggdG8gcHJvZHVjdHNfdXNlciBzdG9yZVxyXG4gICAgICAgICAgaWYgKGRiLm9iamVjdFN0b3JlTmFtZXMuY29udGFpbnMoJ3Byb2R1Y3RzX3VzZXInKSkge1xyXG4gICAgICAgICAgICBjb25zdCB1c2VyU3RvcmUgPSB0cmFuc2FjdGlvbi5vYmplY3RTdG9yZSgncHJvZHVjdHNfdXNlcicpXHJcbiAgICAgICAgICAgIGlmICghdXNlclN0b3JlLmluZGV4TmFtZXMuY29udGFpbnMoJ2hvdXNlaG9sZF9pZCcpKSB7XHJcbiAgICAgICAgICAgICAgdXNlclN0b3JlLmNyZWF0ZUluZGV4KCdob3VzZWhvbGRfaWQnLCAnaG91c2Vob2xkX2lkJywgeyB1bmlxdWU6IGZhbHNlIH0pXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAvLyBBZGQgaG91c2Vob2xkX2lkIGluZGV4IHRvIGNvbnN1bXB0aW9uX2xvZ1xyXG4gICAgICAgICAgaWYgKGRiLm9iamVjdFN0b3JlTmFtZXMuY29udGFpbnMoJ2NvbnN1bXB0aW9uX2xvZycpKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNvbnN1bXB0aW9uU3RvcmUgPSB0cmFuc2FjdGlvbi5vYmplY3RTdG9yZSgnY29uc3VtcHRpb25fbG9nJylcclxuICAgICAgICAgICAgaWYgKCFjb25zdW1wdGlvblN0b3JlLmluZGV4TmFtZXMuY29udGFpbnMoJ2hvdXNlaG9sZF9pZCcpKSB7XHJcbiAgICAgICAgICAgICAgY29uc3VtcHRpb25TdG9yZS5jcmVhdGVJbmRleCgnaG91c2Vob2xkX2lkJywgJ2hvdXNlaG9sZF9pZCcsIHsgdW5pcXVlOiBmYWxzZSB9KVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgLy8gQWRkIGhvdXNlaG9sZF9pZCBpbmRleCB0byBzaG9wcGluZ19saXN0XHJcbiAgICAgICAgICBpZiAoZGIub2JqZWN0U3RvcmVOYW1lcy5jb250YWlucygnc2hvcHBpbmdfbGlzdCcpKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHNob3BwaW5nU3RvcmUgPSB0cmFuc2FjdGlvbi5vYmplY3RTdG9yZSgnc2hvcHBpbmdfbGlzdCcpXHJcbiAgICAgICAgICAgIGlmICghc2hvcHBpbmdTdG9yZS5pbmRleE5hbWVzLmNvbnRhaW5zKCdob3VzZWhvbGRfaWQnKSkge1xyXG4gICAgICAgICAgICAgIHNob3BwaW5nU3RvcmUuY3JlYXRlSW5kZXgoJ2hvdXNlaG9sZF9pZCcsICdob3VzZWhvbGRfaWQnLCB7IHVuaXF1ZTogZmFsc2UgfSlcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfVxyXG5cclxuICAgICAgICAgIC8vIENyZWF0ZSBob3VzZWhvbGRfc2V0dGluZ3Mgc3RvcmUgZm9yIHBlci1ob3VzZWhvbGQgY29uZmlndXJhdGlvblxyXG4gICAgICAgICAgaWYgKCFkYi5vYmplY3RTdG9yZU5hbWVzLmNvbnRhaW5zKCdob3VzZWhvbGRfc2V0dGluZ3MnKSkge1xyXG4gICAgICAgICAgICBjb25zdCBzZXR0aW5nc1N0b3JlID0gZGIuY3JlYXRlT2JqZWN0U3RvcmUoJ2hvdXNlaG9sZF9zZXR0aW5ncycsIHtcclxuICAgICAgICAgICAgICBrZXlQYXRoOiAnaWQnLFxyXG4gICAgICAgICAgICAgIGF1dG9JbmNyZW1lbnQ6IHRydWUsXHJcbiAgICAgICAgICAgIH0pXHJcbiAgICAgICAgICAgIHNldHRpbmdzU3RvcmUuY3JlYXRlSW5kZXgoJ2hvdXNlaG9sZF9pZCcsICdob3VzZWhvbGRfaWQnLCB7IHVuaXF1ZTogdHJ1ZSB9KVxyXG4gICAgICAgICAgICBzZXR0aW5nc1N0b3JlLmNyZWF0ZUluZGV4KCdrZXknLCAna2V5JywgeyB1bmlxdWU6IGZhbHNlIH0pXHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICB9LFxyXG4gICAgfSlcclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIGluaXRpYWxpemUgZGF0YWJhc2U6JywgZXJyb3IpXHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoYERhdGFiYXNlIGluaXRpYWxpemF0aW9uIGZhaWxlZDogJHtlcnJvci5tZXNzYWdlfWApXHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogUnVuIGRhdGFiYXNlIG1pZ3JhdGlvbnNcclxuICogRW5zdXJlcyBkYXRhYmFzZSBpcyBhdCB0aGUgY3VycmVudCB2ZXJzaW9uXHJcbiAqL1xyXG5leHBvcnQgY29uc3QgcnVuTWlncmF0aW9ucyA9IGFzeW5jICgpID0+IHtcclxuICB0cnkge1xyXG4gICAgY29uc3QgZGIgPSBhd2FpdCBpbml0REIoKVxyXG4gICAgY29uc29sZS5sb2coYERhdGFiYXNlIGluaXRpYWxpemVkIGF0IHZlcnNpb24gJHtkYi52ZXJzaW9ufWApXHJcbiAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCB2ZXJzaW9uOiBkYi52ZXJzaW9uIH1cclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgY29uc29sZS5lcnJvcignTWlncmF0aW9uIGZhaWxlZDonLCBlcnJvcilcclxuICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyb3IubWVzc2FnZSB9XHJcbiAgfVxyXG59XHJcblxyXG4vLyBOb3JtYWxpemUgdGV4dCBmb3IgbWF0Y2hpbmcgKHJlbW92ZSBzcGVjaWFsIGNoYXJzLCBsb3dlcmNhc2UsIHRyaW0pXHJcbmNvbnN0IG5vcm1hbGl6ZVRleHQgPSAodGV4dCkgPT4ge1xyXG4gIGlmICghdGV4dCkgcmV0dXJuICcnXHJcbiAgcmV0dXJuIHRleHRcclxuICAgIC50b0xvd2VyQ2FzZSgpXHJcbiAgICAucmVwbGFjZSgvW15hLXowLTlcXHNdL2csICcnKVxyXG4gICAgLnRyaW0oKVxyXG4gICAgLnJlcGxhY2UoL1xccysvZywgJyAnKVxyXG59XHJcblxyXG5jb25zdCBjYW5vbmljYWxDYXRlZ29yeVNsdWcgPSAobmFtZSkgPT4ge1xyXG4gIGNvbnN0IG5vcm1hbGl6ZWQgPSBub3JtYWxpemVUZXh0KG5hbWUpXHJcbiAgaWYgKCFub3JtYWxpemVkKSByZXR1cm4gJ290aGVyJ1xyXG5cclxuICBjb25zdCBsb29rdXAgPSB7XHJcbiAgICBmb29kOiAnZm9vZCcsXHJcbiAgICB3YXRlcjogJ3dhdGVyJyxcclxuICAgIG1lZHM6ICdtZWRzJyxcclxuICAgIG1lZGljYXRpb25zOiAnbWVkcycsXHJcbiAgICBtZWRpY2luZTogJ21lZHMnLFxyXG4gICAgJ2JhdHRlcmllcyBwb3dlcic6ICdiYXR0ZXJpZXNQb3dlcicsXHJcbiAgICBiYXR0ZXJpZXM6ICdiYXR0ZXJpZXNQb3dlcicsXHJcbiAgICBwb3dlcjogJ2JhdHRlcmllc1Bvd2VyJyxcclxuICAgIGhlYXRpbmc6ICdoZWF0aW5nJyxcclxuICAgIGhlYXQ6ICdoZWF0aW5nJyxcclxuICAgIGxpZ2h0OiAnbGlnaHQnLFxyXG4gICAgaHlnaWVuZTogJ2h5Z2llbmUnLFxyXG4gICAgJ2ZpcnN0IGFpZCc6ICdmaXJzdEFpZCcsXHJcbiAgICB0b29sczogJ3Rvb2xzJyxcclxuICAgIGVxdWlwbWVudDogJ3Rvb2xzJyxcclxuICAgICd0b29scyBlcXVpcG1lbnQnOiAndG9vbHMnLFxyXG4gICAgb3RoZXI6ICdvdGhlcicsXHJcbiAgfVxyXG5cclxuICBpZiAobG9va3VwW25vcm1hbGl6ZWRdKSByZXR1cm4gbG9va3VwW25vcm1hbGl6ZWRdXHJcblxyXG4gIC8vIEZhbGxiYWNrIHNsdWc6IGtlYmFiLWNhc2Ugbm9ybWFsaXplZCB0ZXh0XHJcbiAgcmV0dXJuIG5vcm1hbGl6ZWQucmVwbGFjZSgvXFxzKy9nLCAnLScpLnNsaWNlKDAsIDY0KVxyXG59XHJcblxyXG5jb25zdCBzYW5pdGl6ZUNhdGVnb3J5TmFtZSA9IChuYW1lKSA9PiB7XHJcbiAgaWYgKCFuYW1lKSByZXR1cm4gJ090aGVyJ1xyXG4gIHJldHVybiBuYW1lLnRyaW0oKS5yZXBsYWNlKC9cXHMrL2csICcgJykuc2xpY2UoMCwgODApXHJcbn1cclxuXHJcbi8qKlxyXG4gKiBUcmFjayBhIGNoYW5nZSBmb3Igc3luY1xyXG4gKiBMb2dzIG9wZXJhdGlvbnMgKGNyZWF0ZSwgdXBkYXRlLCBkZWxldGUpIHRvIHN5bmNfbG9nXHJcbiAqXHJcbiAqIEBwYXJhbSB7c3RyaW5nfSB0YWJsZSAtIFRhYmxlIG5hbWUgKHByb2R1Y3RzLCBpbnZlbnRvcnksIHNldHRpbmdzKVxyXG4gKiBAcGFyYW0ge251bWJlcnxzdHJpbmd9IHJlY29yZElkIC0gUmVjb3JkIElEXHJcbiAqIEBwYXJhbSB7c3RyaW5nfSBvcGVyYXRpb24gLSBPcGVyYXRpb24gdHlwZSAoY3JlYXRlLCB1cGRhdGUsIGRlbGV0ZSlcclxuICovXHJcbmV4cG9ydCBjb25zdCB0cmFja0NoYW5nZSA9IGFzeW5jICh0YWJsZSwgcmVjb3JkSWQsIG9wZXJhdGlvbikgPT4ge1xyXG4gIHRyeSB7XHJcbiAgICBjb25zdCBkYiA9IGF3YWl0IGluaXREQigpXHJcbiAgICBjb25zdCB0eCA9IGRiLnRyYW5zYWN0aW9uKCdzeW5jX2xvZycsICdyZWFkd3JpdGUnKVxyXG4gICAgYXdhaXQgdHguc3RvcmUuYWRkKHtcclxuICAgICAgdGFibGUsXHJcbiAgICAgIHJlY29yZElkLFxyXG4gICAgICBvcGVyYXRpb24sXHJcbiAgICAgIHRpbWVzdGFtcDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICBzeW5jZWQ6IGZhbHNlLFxyXG4gICAgfSlcclxuICAgIGF3YWl0IHR4LmRvbmVcclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIHRyYWNrIGNoYW5nZTonLCBlcnJvcilcclxuICAgIC8vIERvbid0IHRocm93IC0gdHJhY2tpbmcgZmFpbHVyZSBzaG91bGRuJ3QgYnJlYWsgdGhlIG9wZXJhdGlvblxyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIEdldCBwZW5kaW5nIGNoYW5nZXMgdGhhdCBuZWVkIHRvIGJlIHN5bmNlZFxyXG4gKiBJbmNsdWRlcyB0aGUgYWN0dWFsIGRhdGEgZm9yIGVhY2ggY2hhbmdlZCByZWNvcmRcclxuICpcclxuICogQHJldHVybnMge0FycmF5fSBBcnJheSBvZiB1bnN5bmNlZCBjaGFuZ2VzIHdpdGggZGF0YVxyXG4gKi9cclxuZXhwb3J0IGNvbnN0IGdldFBlbmRpbmdDaGFuZ2VzID0gYXN5bmMgKCkgPT4ge1xyXG4gIHRyeSB7XHJcbiAgICBjb25zdCBkYiA9IGF3YWl0IGluaXREQigpXHJcbiAgICBjb25zdCB0eCA9IGRiLnRyYW5zYWN0aW9uKFsnc3luY19sb2cnLCAncHJvZHVjdHMnLCAnaW52ZW50b3J5JywgJ3NldHRpbmdzJ10sICdyZWFkb25seScpXHJcbiAgICBjb25zdCBpbmRleCA9IHR4Lm9iamVjdFN0b3JlKCdzeW5jX2xvZycpLmluZGV4KCdzeW5jZWQnKVxyXG4gICAgLy8gSW5kZXhlZERCIGtleXMgZG8gbm90IHN1cHBvcnQgYm9vbGVhbnMgYXMgcXVlcnkgdmFsdWVzIGluIGFsbCBicm93c2Vycy5cclxuICAgIC8vIEZldGNoIGFsbCBsb2dzIGZyb20gdGhlIGluZGV4IGFuZCBmaWx0ZXIgdW5zeW5jZWQgY2hhbmdlcyBjbGllbnQtc2lkZS5cclxuICAgIGNvbnN0IGFsbExvZ3MgPSBhd2FpdCBpbmRleC5nZXRBbGwoKVxyXG4gICAgY29uc3QgbG9ncyA9IGFsbExvZ3MuZmlsdGVyKChsb2cpID0+IGxvZyAmJiBsb2cuc3luY2VkID09PSBmYWxzZSlcclxuXHJcbiAgICAvLyBGZXRjaCBhY3R1YWwgZGF0YSBmb3IgZWFjaCBjaGFuZ2VcclxuICAgIGNvbnN0IGNoYW5nZXMgPSBbXVxyXG4gICAgZm9yIChjb25zdCBsb2cgb2YgbG9ncykge1xyXG4gICAgICBsZXQgZGF0YSA9IG51bGxcclxuXHJcbiAgICAgIGlmIChsb2cub3BlcmF0aW9uICE9PSAnZGVsZXRlJykge1xyXG4gICAgICAgIGNvbnN0IHN0b3JlID0gdHgub2JqZWN0U3RvcmUobG9nLnRhYmxlKVxyXG4gICAgICAgIGRhdGEgPSBhd2FpdCBzdG9yZS5nZXQobG9nLnJlY29yZElkKVxyXG4gICAgICB9XHJcblxyXG4gICAgICBjaGFuZ2VzLnB1c2goe1xyXG4gICAgICAgIC4uLmxvZyxcclxuICAgICAgICBkYXRhLFxyXG4gICAgICB9KVxyXG4gICAgfVxyXG5cclxuICAgIGF3YWl0IHR4LmRvbmVcclxuICAgIHJldHVybiBjaGFuZ2VzXHJcbiAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byBnZXQgcGVuZGluZyBjaGFuZ2VzOicsIGVycm9yKVxyXG4gICAgdGhyb3cgbmV3IEVycm9yKGBGYWlsZWQgdG8gcmV0cmlldmUgcGVuZGluZyBjaGFuZ2VzOiAke2Vycm9yLm1lc3NhZ2V9YClcclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBNYXJrIGEgY2hhbmdlIGFzIHN5bmNlZFxyXG4gKlxyXG4gKiBAcGFyYW0ge3N0cmluZ30gdGFibGUgLSBUYWJsZSBuYW1lXHJcbiAqIEBwYXJhbSB7bnVtYmVyfHN0cmluZ30gcmVjb3JkSWQgLSBSZWNvcmQgSURcclxuICovXHJcbmV4cG9ydCBjb25zdCBtYXJrU3luY2VkID0gYXN5bmMgKHRhYmxlLCByZWNvcmRJZCkgPT4ge1xyXG4gIHRyeSB7XHJcbiAgICBjb25zdCBkYiA9IGF3YWl0IGluaXREQigpXHJcbiAgICBjb25zdCB0eCA9IGRiLnRyYW5zYWN0aW9uKCdzeW5jX2xvZycsICdyZWFkd3JpdGUnKVxyXG4gICAgY29uc3QgaW5kZXggPSB0eC5zdG9yZS5pbmRleCgncmVjb3JkSWQnKVxyXG4gICAgbGV0IGN1cnNvciA9IGF3YWl0IGluZGV4Lm9wZW5DdXJzb3IocmVjb3JkSWQpXHJcblxyXG4gICAgd2hpbGUgKGN1cnNvcikge1xyXG4gICAgICBpZiAoY3Vyc29yLnZhbHVlLnRhYmxlID09PSB0YWJsZSAmJiAhY3Vyc29yLnZhbHVlLnN5bmNlZCkge1xyXG4gICAgICAgIGNvbnN0IHJlY29yZCA9IGN1cnNvci52YWx1ZVxyXG4gICAgICAgIHJlY29yZC5zeW5jZWQgPSB0cnVlXHJcbiAgICAgICAgcmVjb3JkLnN5bmNlZEF0ID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpXHJcbiAgICAgICAgYXdhaXQgY3Vyc29yLnVwZGF0ZShyZWNvcmQpXHJcbiAgICAgIH1cclxuICAgICAgY3Vyc29yID0gYXdhaXQgY3Vyc29yLmNvbnRpbnVlKClcclxuICAgIH1cclxuXHJcbiAgICBhd2FpdCB0eC5kb25lXHJcblxyXG4gICAgLy8gQWxzbyB1cGRhdGUgdGhlIHJlY29yZCdzIHN5bmNlZEF0IHRpbWVzdGFtcFxyXG4gICAgY29uc3QgcmVjb3JkVHggPSBkYi50cmFuc2FjdGlvbih0YWJsZSwgJ3JlYWR3cml0ZScpXHJcbiAgICBjb25zdCByZWNvcmRTdG9yZSA9IHJlY29yZFR4Lm9iamVjdFN0b3JlKHRhYmxlKVxyXG4gICAgY29uc3QgcmVjb3JkID0gYXdhaXQgcmVjb3JkU3RvcmUuZ2V0KHJlY29yZElkKVxyXG4gICAgaWYgKHJlY29yZCkge1xyXG4gICAgICByZWNvcmQuc3luY2VkQXQgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKClcclxuICAgICAgYXdhaXQgcmVjb3JkU3RvcmUucHV0KHJlY29yZClcclxuICAgIH1cclxuICAgIGF3YWl0IHJlY29yZFR4LmRvbmVcclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIG1hcmsgY2hhbmdlIGFzIHN5bmNlZDonLCBlcnJvcilcclxuICAgIHRocm93IG5ldyBFcnJvcihgRmFpbGVkIHRvIG1hcmsgY2hhbmdlIGFzIHN5bmNlZDogJHtlcnJvci5tZXNzYWdlfWApXHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogQ2xlYXIgb2xkIHN5bmNlZCBsb2dzIChob3VzZWtlZXBpbmcpXHJcbiAqIFJlbW92ZXMgc3luY2VkIGxvZ3Mgb2xkZXIgdGhhbiBzcGVjaWZpZWQgZGF5c1xyXG4gKlxyXG4gKiBAcGFyYW0ge251bWJlcn0gZGF5c1RvS2VlcCAtIE51bWJlciBvZiBkYXlzIHRvIGtlZXAgc3luY2VkIGxvZ3MgKGRlZmF1bHQ6IDMwKVxyXG4gKi9cclxuZXhwb3J0IGNvbnN0IGNsZWFyT2xkU3luY0xvZ3MgPSBhc3luYyAoZGF5c1RvS2VlcCA9IDMwKSA9PiB7XHJcbiAgdHJ5IHtcclxuICAgIGNvbnN0IGRiID0gYXdhaXQgaW5pdERCKClcclxuICAgIGNvbnN0IGN1dG9mZkRhdGUgPSBuZXcgRGF0ZSgpXHJcbiAgICBjdXRvZmZEYXRlLnNldERhdGUoY3V0b2ZmRGF0ZS5nZXREYXRlKCkgLSBkYXlzVG9LZWVwKVxyXG4gICAgY29uc3QgY3V0b2ZmSVNPID0gY3V0b2ZmRGF0ZS50b0lTT1N0cmluZygpXHJcblxyXG4gICAgY29uc3QgdHggPSBkYi50cmFuc2FjdGlvbignc3luY19sb2cnLCAncmVhZHdyaXRlJylcclxuICAgIGNvbnN0IGluZGV4ID0gdHguc3RvcmUuaW5kZXgoJ3N5bmNlZCcpXHJcbiAgICBsZXQgY3Vyc29yID0gYXdhaXQgaW5kZXgub3BlbkN1cnNvcih0cnVlKSAvLyBPbmx5IHN5bmNlZCBpdGVtc1xyXG5cclxuICAgIGxldCBkZWxldGVkID0gMFxyXG4gICAgd2hpbGUgKGN1cnNvcikge1xyXG4gICAgICBpZiAoY3Vyc29yLnZhbHVlLnN5bmNlZEF0ICYmIGN1cnNvci52YWx1ZS5zeW5jZWRBdCA8IGN1dG9mZklTTykge1xyXG4gICAgICAgIGF3YWl0IGN1cnNvci5kZWxldGUoKVxyXG4gICAgICAgIGRlbGV0ZWQrK1xyXG4gICAgICB9XHJcbiAgICAgIGN1cnNvciA9IGF3YWl0IGN1cnNvci5jb250aW51ZSgpXHJcbiAgICB9XHJcblxyXG4gICAgYXdhaXQgdHguZG9uZVxyXG4gICAgY29uc29sZS5sb2coYENsZWFyZWQgJHtkZWxldGVkfSBvbGQgc3luYyBsb2dzYClcclxuICAgIHJldHVybiBkZWxldGVkXHJcbiAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byBjbGVhciBvbGQgc3luYyBsb2dzOicsIGVycm9yKVxyXG4gIH1cclxufVxyXG5cclxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4vLyBDQVRFR09SWSBPUEVSQVRJT05TXHJcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuXHJcbmNvbnN0IGVuc3VyZUNhdGVnb3JpZXNTdG9yZSA9IGFzeW5jICgpID0+IHtcclxuICB0cnkge1xyXG4gICAgY29uc3QgZGIgPSBhd2FpdCBpbml0REIoKVxyXG4gICAgaWYgKCFkYi5vYmplY3RTdG9yZU5hbWVzLmNvbnRhaW5zKCdjYXRlZ29yaWVzJykpIHtcclxuICAgICAgY29uc29sZS53YXJuKCdDYXRlZ29yaWVzIHN0b3JlIG1pc3Npbmc7IHJldHVybmluZyBkZWZhdWx0cycpXHJcbiAgICAgIHJldHVybiBudWxsXHJcbiAgICB9XHJcbiAgICByZXR1cm4gZGJcclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIGVuc3VyZSBjYXRlZ29yaWVzIHN0b3JlOicsIGVycm9yKVxyXG4gICAgcmV0dXJuIG51bGxcclxuICB9XHJcbn1cclxuXHJcbmV4cG9ydCBjb25zdCBnZXRDYXRlZ29yaWVzID0gYXN5bmMgKHsgaW5jbHVkZUFyY2hpdmVkID0gZmFsc2UgfSA9IHt9KSA9PiB7XHJcbiAgdHJ5IHtcclxuICAgIGNvbnN0IGRiID0gYXdhaXQgZW5zdXJlQ2F0ZWdvcmllc1N0b3JlKClcclxuICAgIGlmICghZGIpIHJldHVybiBERUZBVUxUX0NBVEVHT1JJRVNcclxuXHJcbiAgICBjb25zdCB0eCA9IGRiLnRyYW5zYWN0aW9uKCdjYXRlZ29yaWVzJywgJ3JlYWRvbmx5JylcclxuICAgIGNvbnN0IGl0ZW1zID0gYXdhaXQgdHguc3RvcmUuZ2V0QWxsKClcclxuICAgIGF3YWl0IHR4LmRvbmVcclxuXHJcbiAgICBjb25zdCBmaWx0ZXJlZCA9IGluY2x1ZGVBcmNoaXZlZCA/IGl0ZW1zIDogaXRlbXMuZmlsdGVyKChjKSA9PiAhYy5hcmNoaXZlZClcclxuICAgIGlmICghZmlsdGVyZWQubGVuZ3RoKSB7XHJcbiAgICAgIC8vIFNlZWQgZGVmYXVsdHMgaWYgZW1wdHlcclxuICAgICAgY29uc3Qgbm93ID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpXHJcbiAgICAgIGNvbnN0IHNlZWRUeCA9IGRiLnRyYW5zYWN0aW9uKCdjYXRlZ29yaWVzJywgJ3JlYWR3cml0ZScpXHJcbiAgICAgIGZvciAoY29uc3QgY2F0IG9mIERFRkFVTFRfQ0FURUdPUklFUykge1xyXG4gICAgICAgIGF3YWl0IHNlZWRUeC5zdG9yZS5hZGQoe1xyXG4gICAgICAgICAgLi4uY2F0LFxyXG4gICAgICAgICAgbm9ybWFsaXplZE5hbWU6IG5vcm1hbGl6ZVRleHQoY2F0Lm5hbWUpLFxyXG4gICAgICAgICAgYXJjaGl2ZWQ6IGZhbHNlLFxyXG4gICAgICAgICAgY3JlYXRlZEF0OiBub3csXHJcbiAgICAgICAgICB1cGRhdGVkQXQ6IG5vdyxcclxuICAgICAgICB9KVxyXG4gICAgICB9XHJcbiAgICAgIGF3YWl0IHNlZWRUeC5kb25lXHJcbiAgICAgIHJldHVybiBERUZBVUxUX0NBVEVHT1JJRVNcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gZmlsdGVyZWRcclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIGxvYWQgY2F0ZWdvcmllczonLCBlcnJvcilcclxuICAgIHJldHVybiBERUZBVUxUX0NBVEVHT1JJRVNcclxuICB9XHJcbn1cclxuXHJcbmV4cG9ydCBjb25zdCB1cHNlcnRDYXRlZ29yeSA9IGFzeW5jIChpbnB1dCkgPT4ge1xyXG4gIGNvbnN0IG5hbWUgPSBzYW5pdGl6ZUNhdGVnb3J5TmFtZSh0eXBlb2YgaW5wdXQgPT09ICdzdHJpbmcnID8gaW5wdXQgOiBpbnB1dD8ubmFtZSlcclxuICBjb25zdCBzbHVnRnJvbUlucHV0ID0gdHlwZW9mIGlucHV0ID09PSAnb2JqZWN0JyAmJiBpbnB1dD8uc2x1ZyA/IGlucHV0LnNsdWcgOiBudWxsXHJcbiAgY29uc3Qgc2x1ZyA9IHNsdWdGcm9tSW5wdXQgfHwgY2Fub25pY2FsQ2F0ZWdvcnlTbHVnKG5hbWUpXHJcbiAgY29uc3Qgbm9ybWFsaXplZE5hbWUgPSBub3JtYWxpemVUZXh0KG5hbWUpXHJcblxyXG4gIHRyeSB7XHJcbiAgICBjb25zdCBkYiA9IGF3YWl0IGVuc3VyZUNhdGVnb3JpZXNTdG9yZSgpXHJcbiAgICBpZiAoIWRiKSB7XHJcbiAgICAgIGNvbnN0IGZhbGxiYWNrID0gREVGQVVMVF9DQVRFR09SSUVTLmZpbmQoKGMpID0+IGMuc2x1ZyA9PT0gc2x1ZylcclxuICAgICAgcmV0dXJuIGZhbGxiYWNrIHx8IHsgaWQ6IG51bGwsIHNsdWcsIG5hbWUgfVxyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IHR4ID0gZGIudHJhbnNhY3Rpb24oJ2NhdGVnb3JpZXMnLCAncmVhZHdyaXRlJylcclxuICAgIGNvbnN0IG5vcm1hbGl6ZWRJbmRleCA9IHR4LnN0b3JlLmluZGV4KCdub3JtYWxpemVkTmFtZScpXHJcbiAgICBjb25zdCBleGlzdGluZyA9IGF3YWl0IG5vcm1hbGl6ZWRJbmRleC5nZXQobm9ybWFsaXplZE5hbWUpXHJcblxyXG4gICAgY29uc3Qgbm93ID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpXHJcbiAgICBpZiAoZXhpc3RpbmcpIHtcclxuICAgICAgY29uc3QgdXBkYXRlZCA9IHtcclxuICAgICAgICAuLi5leGlzdGluZyxcclxuICAgICAgICBuYW1lLFxyXG4gICAgICAgIHNsdWcsXHJcbiAgICAgICAgbm9ybWFsaXplZE5hbWUsXHJcbiAgICAgICAgYXJjaGl2ZWQ6IGZhbHNlLFxyXG4gICAgICAgIHVwZGF0ZWRBdDogbm93LFxyXG4gICAgICB9XHJcbiAgICAgIGF3YWl0IHR4LnN0b3JlLnB1dCh1cGRhdGVkKVxyXG4gICAgICBhd2FpdCB0eC5kb25lXHJcbiAgICAgIHJldHVybiB1cGRhdGVkXHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgaWQgPSBhd2FpdCB0eC5zdG9yZS5hZGQoe1xyXG4gICAgICBuYW1lLFxyXG4gICAgICBzbHVnLFxyXG4gICAgICBub3JtYWxpemVkTmFtZSxcclxuICAgICAgYXJjaGl2ZWQ6IGZhbHNlLFxyXG4gICAgICBjcmVhdGVkQXQ6IG5vdyxcclxuICAgICAgdXBkYXRlZEF0OiBub3csXHJcbiAgICB9KVxyXG4gICAgYXdhaXQgdHguZG9uZVxyXG5cclxuICAgIHJldHVybiB7IGlkLCBuYW1lLCBzbHVnLCBub3JtYWxpemVkTmFtZSwgYXJjaGl2ZWQ6IGZhbHNlLCBjcmVhdGVkQXQ6IG5vdywgdXBkYXRlZEF0OiBub3cgfVxyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gdXBzZXJ0IGNhdGVnb3J5OicsIGVycm9yKVxyXG4gICAgcmV0dXJuIHsgaWQ6IG51bGwsIG5hbWUsIHNsdWcgfVxyXG4gIH1cclxufVxyXG5cclxuY29uc3QgdXBkYXRlQ2F0ZWdvcnlTbHVnSW5TdG9yZSA9IGFzeW5jIChkYiwgc3RvcmVOYW1lLCBzb3VyY2VTbHVnLCB0YXJnZXRTbHVnKSA9PiB7XHJcbiAgaWYgKCFkYi5vYmplY3RTdG9yZU5hbWVzLmNvbnRhaW5zKHN0b3JlTmFtZSkpIHJldHVyblxyXG5cclxuICBjb25zdCB0eCA9IGRiLnRyYW5zYWN0aW9uKHN0b3JlTmFtZSwgJ3JlYWR3cml0ZScpXHJcbiAgbGV0IGN1cnNvciA9IGF3YWl0IHR4LnN0b3JlLm9wZW5DdXJzb3IoKVxyXG4gIHdoaWxlIChjdXJzb3IpIHtcclxuICAgIGNvbnN0IHZhbHVlID0gY3Vyc29yLnZhbHVlXHJcbiAgICBpZiAodmFsdWUuY2F0ZWdvcnkgPT09IHNvdXJjZVNsdWcpIHtcclxuICAgICAgdmFsdWUuY2F0ZWdvcnkgPSB0YXJnZXRTbHVnXHJcbiAgICAgIGF3YWl0IGN1cnNvci51cGRhdGUodmFsdWUpXHJcbiAgICB9XHJcbiAgICBjdXJzb3IgPSBhd2FpdCBjdXJzb3IuY29udGludWUoKVxyXG4gIH1cclxuICBhd2FpdCB0eC5kb25lXHJcbn1cclxuXHJcbmV4cG9ydCBjb25zdCBtZXJnZUNhdGVnb3JpZXMgPSBhc3luYyAodGFyZ2V0U2x1Zywgc291cmNlU2x1Z3MgPSBbXSkgPT4ge1xyXG4gIGNvbnN0IHVuaXF1ZVNvdXJjZXMgPSBbLi4ubmV3IFNldChzb3VyY2VTbHVncyldLmZpbHRlcigocykgPT4gcyAmJiBzICE9PSB0YXJnZXRTbHVnKVxyXG4gIGlmICghdGFyZ2V0U2x1ZyB8fCB1bmlxdWVTb3VyY2VzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIHsgdXBkYXRlZDogMCB9XHJcblxyXG4gIHRyeSB7XHJcbiAgICBjb25zdCBkYiA9IGF3YWl0IGVuc3VyZUNhdGVnb3JpZXNTdG9yZSgpXHJcbiAgICBpZiAoIWRiKSByZXR1cm4geyB1cGRhdGVkOiAwIH1cclxuXHJcbiAgICBjb25zdCB0eCA9IGRiLnRyYW5zYWN0aW9uKCdjYXRlZ29yaWVzJywgJ3JlYWR3cml0ZScpXHJcbiAgICBjb25zdCBzbHVnSW5kZXggPSB0eC5zdG9yZS5pbmRleCgnc2x1ZycpXHJcbiAgICBjb25zdCB0YXJnZXQgPSBhd2FpdCBzbHVnSW5kZXguZ2V0KHRhcmdldFNsdWcpXHJcblxyXG4gICAgaWYgKCF0YXJnZXQpIHtcclxuICAgICAgYXdhaXQgdHguZG9uZVxyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYFRhcmdldCBjYXRlZ29yeSAke3RhcmdldFNsdWd9IG5vdCBmb3VuZGApXHJcbiAgICB9XHJcblxyXG4gICAgYXdhaXQgdHguZG9uZVxyXG5cclxuICAgIGNvbnN0IHN0b3Jlc1RvVXBkYXRlID0gW1xyXG4gICAgICAncHJvZHVjdHMnLFxyXG4gICAgICAnaW52ZW50b3J5JyxcclxuICAgICAgJ3Nob3BwaW5nX2xpc3QnLFxyXG4gICAgICAnY29uc3VtcHRpb25fbG9nJyxcclxuICAgICAgJ3Byb2R1Y3RzX3VzZXInLFxyXG4gICAgICAncHJvZHVjdHNfY2F0YWxvZycsXHJcbiAgICBdXHJcblxyXG4gICAgbGV0IHVwZGF0ZXMgPSAwXHJcbiAgICBmb3IgKGNvbnN0IHNvdXJjZVNsdWcgb2YgdW5pcXVlU291cmNlcykge1xyXG4gICAgICBmb3IgKGNvbnN0IHN0b3JlIG9mIHN0b3Jlc1RvVXBkYXRlKSB7XHJcbiAgICAgICAgYXdhaXQgdXBkYXRlQ2F0ZWdvcnlTbHVnSW5TdG9yZShkYiwgc3RvcmUsIHNvdXJjZVNsdWcsIHRhcmdldFNsdWcpXHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGNvbnN0IGFyY2hpdmVUeCA9IGRiLnRyYW5zYWN0aW9uKCdjYXRlZ29yaWVzJywgJ3JlYWR3cml0ZScpXHJcbiAgICAgIGNvbnN0IGlkeCA9IGFyY2hpdmVUeC5zdG9yZS5pbmRleCgnc2x1ZycpXHJcbiAgICAgIGNvbnN0IHNvdXJjZVJlY29yZCA9IGF3YWl0IGlkeC5nZXQoc291cmNlU2x1ZylcclxuICAgICAgaWYgKHNvdXJjZVJlY29yZCkge1xyXG4gICAgICAgIHNvdXJjZVJlY29yZC5hcmNoaXZlZCA9IHRydWVcclxuICAgICAgICBzb3VyY2VSZWNvcmQudXBkYXRlZEF0ID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpXHJcbiAgICAgICAgYXdhaXQgYXJjaGl2ZVR4LnN0b3JlLnB1dChzb3VyY2VSZWNvcmQpXHJcbiAgICAgICAgdXBkYXRlcysrXHJcbiAgICAgIH1cclxuICAgICAgYXdhaXQgYXJjaGl2ZVR4LmRvbmVcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4geyB1cGRhdGVkOiB1cGRhdGVzIH1cclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIG1lcmdlIGNhdGVnb3JpZXM6JywgZXJyb3IpXHJcbiAgICByZXR1cm4geyB1cGRhdGVkOiAwLCBlcnJvcjogZXJyb3IubWVzc2FnZSB9XHJcbiAgfVxyXG59XHJcblxyXG5leHBvcnQgY29uc3QgZ2V0Q2F0ZWdvcnlVc2FnZUNvdW50cyA9IGFzeW5jICgpID0+IHtcclxuICBjb25zdCBjb3VudHMgPSB7fVxyXG4gIHRyeSB7XHJcbiAgICBjb25zdCBkYiA9IGF3YWl0IGluaXREQigpXHJcbiAgICBjb25zdCBhZGRDb3VudCA9IChzbHVnKSA9PiB7XHJcbiAgICAgIGlmICghc2x1ZykgcmV0dXJuXHJcbiAgICAgIGNvdW50c1tzbHVnXSA9IGNvdW50c1tzbHVnXSA/IGNvdW50c1tzbHVnXSArIDEgOiAxXHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgaW52ZW50b3J5ID0gYXdhaXQgZGIuZ2V0QWxsKCdpbnZlbnRvcnknKVxyXG4gICAgaW52ZW50b3J5LmZvckVhY2goKGl0ZW0pID0+IGFkZENvdW50KGl0ZW0uY2F0ZWdvcnkpKVxyXG5cclxuICAgIGNvbnN0IHByb2R1Y3RzID0gYXdhaXQgZGIuZ2V0QWxsKCdwcm9kdWN0cycpXHJcbiAgICBwcm9kdWN0cy5mb3JFYWNoKChwKSA9PiBhZGRDb3VudChwLmNhdGVnb3J5KSlcclxuXHJcbiAgICBpZiAoZGIub2JqZWN0U3RvcmVOYW1lcy5jb250YWlucygnc2hvcHBpbmdfbGlzdCcpKSB7XHJcbiAgICAgIGNvbnN0IHNob3BwaW5nID0gYXdhaXQgZGIuZ2V0QWxsKCdzaG9wcGluZ19saXN0JylcclxuICAgICAgc2hvcHBpbmcuZm9yRWFjaCgoaXRlbSkgPT4gYWRkQ291bnQoaXRlbS5jYXRlZ29yeSkpXHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIGNvdW50c1xyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gY29tcHV0ZSBjYXRlZ29yeSB1c2FnZSBjb3VudHM6JywgZXJyb3IpXHJcbiAgICByZXR1cm4gY291bnRzXHJcbiAgfVxyXG59XHJcblxyXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbi8vIFBST0RVQ1QgT1BFUkFUSU9OU1xyXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcblxyXG4vKipcclxuICogQWRkIGEgbmV3IHByb2R1Y3RcclxuICogQHBhcmFtIHtPYmplY3R9IHByb2R1Y3QgLSBQcm9kdWN0IGRhdGFcclxuICogQHJldHVybnMge251bWJlcn0gUHJvZHVjdCBJRFxyXG4gKi9cclxuZXhwb3J0IGNvbnN0IGFkZFByb2R1Y3QgPSBhc3luYyAocHJvZHVjdCkgPT4ge1xyXG4gIHRyeSB7XHJcbiAgICBjb25zdCBkYiA9IGF3YWl0IGluaXREQigpXHJcbiAgICBjb25zdCBub3JtYWxpemVkTmFtZSA9IG5vcm1hbGl6ZVRleHQocHJvZHVjdC5uYW1lKVxyXG4gICAgY29uc3Qgbm93ID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpXHJcblxyXG4gICAgY29uc3QgcHJvZHVjdERhdGEgPSB7XHJcbiAgICAgIC4uLnByb2R1Y3QsXHJcbiAgICAgIG5vcm1hbGl6ZWROYW1lLFxyXG4gICAgICBjcmVhdGVkQXQ6IG5vdyxcclxuICAgICAgdXBkYXRlZEF0OiBub3csXHJcbiAgICAgIHN5bmNlZEF0OiBudWxsLFxyXG4gICAgICBfZGVsZXRlZDogZmFsc2UsXHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgdHggPSBkYi50cmFuc2FjdGlvbigncHJvZHVjdHMnLCAncmVhZHdyaXRlJylcclxuICAgIGNvbnN0IGlkID0gYXdhaXQgdHguc3RvcmUuYWRkKHByb2R1Y3REYXRhKVxyXG4gICAgYXdhaXQgdHguZG9uZVxyXG5cclxuICAgIC8vIFRyYWNrIGNoYW5nZSBmb3Igc3luY1xyXG4gICAgYXdhaXQgdHJhY2tDaGFuZ2UoJ3Byb2R1Y3RzJywgaWQsICdjcmVhdGUnKVxyXG5cclxuICAgIHJldHVybiBpZFxyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gYWRkIHByb2R1Y3Q6JywgZXJyb3IpXHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoYEZhaWxlZCB0byBhZGQgcHJvZHVjdDogJHtlcnJvci5tZXNzYWdlfWApXHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogR2V0IGFsbCBwcm9kdWN0cyAoZXhjbHVkaW5nIGRlbGV0ZWQpXHJcbiAqIEBwYXJhbSB7Ym9vbGVhbn0gaW5jbHVkZURlbGV0ZWQgLSBJbmNsdWRlIHNvZnQtZGVsZXRlZCBwcm9kdWN0c1xyXG4gKiBAcmV0dXJucyB7QXJyYXl9IEFycmF5IG9mIHByb2R1Y3RzXHJcbiAqL1xyXG5leHBvcnQgY29uc3QgZ2V0UHJvZHVjdHMgPSBhc3luYyAoaW5jbHVkZURlbGV0ZWQgPSBmYWxzZSkgPT4ge1xyXG4gIHRyeSB7XHJcbiAgICBjb25zdCBkYiA9IGF3YWl0IGluaXREQigpXHJcbiAgICBjb25zdCBwcm9kdWN0cyA9IGF3YWl0IGRiLmdldEFsbCgncHJvZHVjdHMnKVxyXG5cclxuICAgIGlmIChpbmNsdWRlRGVsZXRlZCkge1xyXG4gICAgICByZXR1cm4gcHJvZHVjdHNcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gcHJvZHVjdHMuZmlsdGVyKChwKSA9PiAhcC5fZGVsZXRlZClcclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIGdldCBwcm9kdWN0czonLCBlcnJvcilcclxuICAgIHRocm93IG5ldyBFcnJvcihgRmFpbGVkIHRvIHJldHJpZXZlIHByb2R1Y3RzOiAke2Vycm9yLm1lc3NhZ2V9YClcclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBHZXQgcHJvZHVjdCBieSBJRFxyXG4gKiBAcGFyYW0ge251bWJlcn0gaWQgLSBQcm9kdWN0IElEXHJcbiAqIEByZXR1cm5zIHtPYmplY3R8bnVsbH0gUHJvZHVjdCBvciBudWxsIGlmIG5vdCBmb3VuZFxyXG4gKi9cclxuZXhwb3J0IGNvbnN0IGdldFByb2R1Y3RCeUlkID0gYXN5bmMgKGlkKSA9PiB7XHJcbiAgdHJ5IHtcclxuICAgIGNvbnN0IGRiID0gYXdhaXQgaW5pdERCKClcclxuICAgIGNvbnN0IHByb2R1Y3QgPSBhd2FpdCBkYi5nZXQoJ3Byb2R1Y3RzJywgaWQpXHJcbiAgICByZXR1cm4gcHJvZHVjdCAmJiAhcHJvZHVjdC5fZGVsZXRlZCA/IHByb2R1Y3QgOiBudWxsXHJcbiAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byBnZXQgcHJvZHVjdDonLCBlcnJvcilcclxuICAgIHRocm93IG5ldyBFcnJvcihgRmFpbGVkIHRvIHJldHJpZXZlIHByb2R1Y3Q6ICR7ZXJyb3IubWVzc2FnZX1gKVxyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIEdldCBwcm9kdWN0IGJ5IGJhcmNvZGVcclxuICogQHBhcmFtIHtzdHJpbmd9IGJhcmNvZGUgLSBQcm9kdWN0IGJhcmNvZGVcclxuICogQHJldHVybnMge09iamVjdHxudWxsfSBQcm9kdWN0IG9yIG51bGwgaWYgbm90IGZvdW5kXHJcbiAqL1xyXG5leHBvcnQgY29uc3QgZ2V0UHJvZHVjdEJ5QmFyY29kZSA9IGFzeW5jIChiYXJjb2RlKSA9PiB7XHJcbiAgdHJ5IHtcclxuICAgIGNvbnN0IGRiID0gYXdhaXQgaW5pdERCKClcclxuICAgIGNvbnN0IHR4ID0gZGIudHJhbnNhY3Rpb24oJ3Byb2R1Y3RzJywgJ3JlYWRvbmx5JylcclxuICAgIGNvbnN0IGluZGV4ID0gdHguc3RvcmUuaW5kZXgoJ2JhcmNvZGUnKVxyXG4gICAgY29uc3QgcHJvZHVjdCA9IGF3YWl0IGluZGV4LmdldChiYXJjb2RlKVxyXG4gICAgYXdhaXQgdHguZG9uZVxyXG4gICAgcmV0dXJuIHByb2R1Y3QgJiYgIXByb2R1Y3QuX2RlbGV0ZWQgPyBwcm9kdWN0IDogbnVsbFxyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gZ2V0IHByb2R1Y3QgYnkgYmFyY29kZTonLCBlcnJvcilcclxuICAgIHJldHVybiBudWxsXHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogRmluZCBwcm9kdWN0IGJ5IG5hbWUgKGZ1enp5IG1hdGNoaW5nKVxyXG4gKiBAcGFyYW0ge3N0cmluZ30gc2Nhbm5lZFRleHQgLSBUZXh0IHRvIHNlYXJjaCBmb3JcclxuICogQHJldHVybnMge09iamVjdHxudWxsfSBNYXRjaGluZyBwcm9kdWN0IG9yIG51bGxcclxuICovXHJcbmV4cG9ydCBjb25zdCBmaW5kUHJvZHVjdEJ5TmFtZSA9IGFzeW5jIChzY2FubmVkVGV4dCkgPT4ge1xyXG4gIHRyeSB7XHJcbiAgICBjb25zdCBkYiA9IGF3YWl0IGluaXREQigpXHJcbiAgICBjb25zdCBub3JtYWxpemVkID0gbm9ybWFsaXplVGV4dChzY2FubmVkVGV4dClcclxuICAgIGNvbnN0IHByb2R1Y3RzID0gYXdhaXQgZGIuZ2V0QWxsKCdwcm9kdWN0cycpXHJcblxyXG4gICAgLy8gRmluZCBleGFjdCBvciBwYXJ0aWFsIG1hdGNoIChleGNsdWRpbmcgZGVsZXRlZClcclxuICAgIHJldHVybiBwcm9kdWN0cy5maW5kKChwKSA9PiB7XHJcbiAgICAgIGlmIChwLl9kZWxldGVkKSByZXR1cm4gZmFsc2VcclxuICAgICAgY29uc3QgcHJvZHVjdE5vcm1hbGl6ZWQgPSBwLm5vcm1hbGl6ZWROYW1lXHJcbiAgICAgIHJldHVybiBwcm9kdWN0Tm9ybWFsaXplZC5pbmNsdWRlcyhub3JtYWxpemVkKSB8fCBub3JtYWxpemVkLmluY2x1ZGVzKHByb2R1Y3ROb3JtYWxpemVkKVxyXG4gICAgfSlcclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIGZpbmQgcHJvZHVjdDonLCBlcnJvcilcclxuICAgIHJldHVybiBudWxsXHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogVXBkYXRlIHByb2R1Y3RcclxuICogQHBhcmFtIHtudW1iZXJ9IGlkIC0gUHJvZHVjdCBJRFxyXG4gKiBAcGFyYW0ge09iamVjdH0gdXBkYXRlcyAtIEZpZWxkcyB0byB1cGRhdGVcclxuICovXHJcbmV4cG9ydCBjb25zdCB1cGRhdGVQcm9kdWN0ID0gYXN5bmMgKGlkLCB1cGRhdGVzKSA9PiB7XHJcbiAgdHJ5IHtcclxuICAgIGNvbnN0IGRiID0gYXdhaXQgaW5pdERCKClcclxuICAgIGNvbnN0IHR4ID0gZGIudHJhbnNhY3Rpb24oJ3Byb2R1Y3RzJywgJ3JlYWR3cml0ZScpXHJcbiAgICBjb25zdCBwcm9kdWN0ID0gYXdhaXQgdHguc3RvcmUuZ2V0KGlkKVxyXG5cclxuICAgIGlmICghcHJvZHVjdCkge1xyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYFByb2R1Y3Qgd2l0aCBJRCAke2lkfSBub3QgZm91bmRgKVxyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IHVwZGF0ZWRQcm9kdWN0ID0ge1xyXG4gICAgICAuLi5wcm9kdWN0LFxyXG4gICAgICAuLi51cGRhdGVzLFxyXG4gICAgICB1cGRhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgc3luY2VkQXQ6IG51bGwsIC8vIE1hcmsgYXMgbmVlZGluZyBzeW5jXHJcbiAgICB9XHJcblxyXG4gICAgLy8gVXBkYXRlIG5vcm1hbGl6ZWROYW1lIGlmIG5hbWUgY2hhbmdlZFxyXG4gICAgaWYgKHVwZGF0ZXMubmFtZSAmJiB1cGRhdGVzLm5hbWUgIT09IHByb2R1Y3QubmFtZSkge1xyXG4gICAgICB1cGRhdGVkUHJvZHVjdC5ub3JtYWxpemVkTmFtZSA9IG5vcm1hbGl6ZVRleHQodXBkYXRlcy5uYW1lKVxyXG4gICAgfVxyXG5cclxuICAgIGF3YWl0IHR4LnN0b3JlLnB1dCh1cGRhdGVkUHJvZHVjdClcclxuICAgIGF3YWl0IHR4LmRvbmVcclxuXHJcbiAgICAvLyBUcmFjayBjaGFuZ2UgZm9yIHN5bmNcclxuICAgIGF3YWl0IHRyYWNrQ2hhbmdlKCdwcm9kdWN0cycsIGlkLCAndXBkYXRlJylcclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIHVwZGF0ZSBwcm9kdWN0OicsIGVycm9yKVxyXG4gICAgdGhyb3cgbmV3IEVycm9yKGBGYWlsZWQgdG8gdXBkYXRlIHByb2R1Y3Q6ICR7ZXJyb3IubWVzc2FnZX1gKVxyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIERlbGV0ZSBwcm9kdWN0IChzb2Z0IGRlbGV0ZSlcclxuICogQHBhcmFtIHtudW1iZXJ9IGlkIC0gUHJvZHVjdCBJRFxyXG4gKiBAcGFyYW0ge2Jvb2xlYW59IGhhcmQgLSBQZXJtYW5lbnRseSBkZWxldGUgKGRlZmF1bHQ6IGZhbHNlKVxyXG4gKi9cclxuZXhwb3J0IGNvbnN0IGRlbGV0ZVByb2R1Y3QgPSBhc3luYyAoaWQsIGhhcmQgPSBmYWxzZSkgPT4ge1xyXG4gIHRyeSB7XHJcbiAgICBjb25zdCBkYiA9IGF3YWl0IGluaXREQigpXHJcbiAgICBjb25zdCB0eCA9IGRiLnRyYW5zYWN0aW9uKCdwcm9kdWN0cycsICdyZWFkd3JpdGUnKVxyXG5cclxuICAgIGlmIChoYXJkKSB7XHJcbiAgICAgIGF3YWl0IHR4LnN0b3JlLmRlbGV0ZShpZClcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIGNvbnN0IHByb2R1Y3QgPSBhd2FpdCB0eC5zdG9yZS5nZXQoaWQpXHJcbiAgICAgIGlmIChwcm9kdWN0KSB7XHJcbiAgICAgICAgcHJvZHVjdC5fZGVsZXRlZCA9IHRydWVcclxuICAgICAgICBwcm9kdWN0LnVwZGF0ZWRBdCA9IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKVxyXG4gICAgICAgIHByb2R1Y3Quc3luY2VkQXQgPSBudWxsXHJcbiAgICAgICAgYXdhaXQgdHguc3RvcmUucHV0KHByb2R1Y3QpXHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBhd2FpdCB0eC5kb25lXHJcblxyXG4gICAgLy8gVHJhY2sgY2hhbmdlIGZvciBzeW5jXHJcbiAgICBhd2FpdCB0cmFja0NoYW5nZSgncHJvZHVjdHMnLCBpZCwgJ2RlbGV0ZScpXHJcbiAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byBkZWxldGUgcHJvZHVjdDonLCBlcnJvcilcclxuICAgIHRocm93IG5ldyBFcnJvcihgRmFpbGVkIHRvIGRlbGV0ZSBwcm9kdWN0OiAke2Vycm9yLm1lc3NhZ2V9YClcclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBVcHNlcnQgcHJvZHVjdCAoaW5zZXJ0IG9yIHVwZGF0ZSlcclxuICogVXNlZCBieSBzeW5jIGVuZ2luZSB0byBtZXJnZSByZW1vdGUgZGF0YVxyXG4gKiBAcGFyYW0ge09iamVjdH0gcHJvZHVjdCAtIFByb2R1Y3QgZGF0YSB3aXRoIGlkXHJcbiAqL1xyXG5leHBvcnQgY29uc3QgdXBzZXJ0UHJvZHVjdCA9IGFzeW5jIChwcm9kdWN0KSA9PiB7XHJcbiAgdHJ5IHtcclxuICAgIGNvbnN0IGRiID0gYXdhaXQgaW5pdERCKClcclxuICAgIGNvbnN0IHR4ID0gZGIudHJhbnNhY3Rpb24oJ3Byb2R1Y3RzJywgJ3JlYWR3cml0ZScpXHJcblxyXG4gICAgLy8gQXR0ZW1wdCB0byBmaW5kIGFuIGV4aXN0aW5nIHByb2R1Y3QgYnkgYmFyY29kZSBmaXJzdCB0byBhdm9pZFxyXG4gICAgLy8gY3JlYXRpbmcgZHVwbGljYXRlcyB3aGVuIHN5bmNpbmcgcmVtb3RlIHJlY29yZHMgdGhhdCB1c2UgZGlmZmVyZW50IGlkcy5cclxuICAgIGxldCBleGlzdGluZyA9IG51bGxcclxuICAgIHRyeSB7XHJcbiAgICAgIGlmIChwcm9kdWN0LmJhcmNvZGUpIHtcclxuICAgICAgICBleGlzdGluZyA9IGF3YWl0IHR4LnN0b3JlLmluZGV4KCdiYXJjb2RlJykuZ2V0KHByb2R1Y3QuYmFyY29kZSlcclxuICAgICAgfVxyXG4gICAgfSBjYXRjaCAoX2Vycikge1xyXG4gICAgICAvLyBJbmRleCBtaWdodCBub3QgZXhpc3QgaW4gb2xkZXIgREIgdmVyc2lvbnMgLSBpZ25vcmUgYW5kIGNvbnRpbnVlXHJcbiAgICAgIGV4aXN0aW5nID0gbnVsbFxyXG4gICAgfVxyXG5cclxuICAgIC8vIElmIG5vIG1hdGNoIGJ5IGJhcmNvZGUsIHRyeSBtYXRjaGluZyBieSBwcm92aWRlZCBpZFxyXG4gICAgaWYgKCFleGlzdGluZyAmJiBwcm9kdWN0LmlkKSB7XHJcbiAgICAgIGV4aXN0aW5nID0gYXdhaXQgdHguc3RvcmUuZ2V0KHByb2R1Y3QuaWQpXHJcbiAgICB9XHJcblxyXG4gICAgbGV0IHByb2R1Y3REYXRhXHJcbiAgICBpZiAoZXhpc3RpbmcpIHtcclxuICAgICAgLy8gTWVyZ2UgcmVjb3JkcyAtIHByZWZlciB0aGUgbW9zdCByZWNlbnRseSB1cGRhdGVkXHJcbiAgICAgIGNvbnN0IGV4aXN0aW5nVGltZSA9IG5ldyBEYXRlKGV4aXN0aW5nLnVwZGF0ZWRfYXQgfHwgZXhpc3RpbmcudXBkYXRlZEF0IHx8IDApXHJcbiAgICAgIGNvbnN0IHJlbW90ZVRpbWUgPSBuZXcgRGF0ZShwcm9kdWN0LnVwZGF0ZWRfYXQgfHwgcHJvZHVjdC51cGRhdGVkQXQgfHwgMClcclxuXHJcbiAgICAgIHByb2R1Y3REYXRhID1cclxuICAgICAgICByZW1vdGVUaW1lID49IGV4aXN0aW5nVGltZSA/IHsgLi4uZXhpc3RpbmcsIC4uLnByb2R1Y3QgfSA6IHsgLi4ucHJvZHVjdCwgLi4uZXhpc3RpbmcgfVxyXG5cclxuICAgICAgLy8gRW5zdXJlIHdlIGtlZXAgdGhlIGxvY2FsIG51bWVyaWMgaWQgd2hlbiBwcmVzZW50XHJcbiAgICAgIGlmIChleGlzdGluZy5pZCAhPT0gdW5kZWZpbmVkKSBwcm9kdWN0RGF0YS5pZCA9IGV4aXN0aW5nLmlkXHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBwcm9kdWN0RGF0YSA9IHsgLi4ucHJvZHVjdCB9XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRW5zdXJlIG5vcm1hbGl6ZWQgbmFtZVxyXG4gICAgaWYgKHByb2R1Y3REYXRhLm5hbWUgJiYgIXByb2R1Y3REYXRhLm5vcm1hbGl6ZWROYW1lKSB7XHJcbiAgICAgIHByb2R1Y3REYXRhLm5vcm1hbGl6ZWROYW1lID0gbm9ybWFsaXplVGV4dChwcm9kdWN0RGF0YS5uYW1lKVxyXG4gICAgfVxyXG5cclxuICAgIC8vIFB1dCB3aWxsIGluc2VydCBvciB1cGRhdGUgdXNpbmcgdGhlIGtleVBhdGg7IHByZWZlciBwdXQgc28gcHJvdmlkZWQgaWRzIChVVUlEcylcclxuICAgIC8vIGZyb20gcmVtb3RlIGFyZSBwcmVzZXJ2ZWQgd2hlbiBuZWVkZWQsIGJ1dCBpZiB3ZSBtYXRjaGVkIGFuIGV4aXN0aW5nIHJlY29yZFxyXG4gICAgLy8gdGhlIGV4aXN0aW5nIG51bWVyaWMgaWQgd2lsbCBiZSB1c2VkLlxyXG4gICAgYXdhaXQgdHguc3RvcmUucHV0KHByb2R1Y3REYXRhKVxyXG4gICAgYXdhaXQgdHguZG9uZVxyXG5cclxuICAgIHJldHVybiBwcm9kdWN0RGF0YS5pZFxyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gdXBzZXJ0IHByb2R1Y3Q6JywgZXJyb3IpXHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoYEZhaWxlZCB0byB1cHNlcnQgcHJvZHVjdDogJHtlcnJvci5tZXNzYWdlfWApXHJcbiAgfVxyXG59XHJcblxyXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbi8vIElOVkVOVE9SWSBPUEVSQVRJT05TXHJcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuXHJcbi8qKlxyXG4gKiBBZGQgaW52ZW50b3J5IGl0ZW1cclxuICogQHBhcmFtIHtPYmplY3R9IGl0ZW0gLSBJbnZlbnRvcnkgaXRlbSBkYXRhXHJcbiAqIEByZXR1cm5zIHtudW1iZXJ9IEludmVudG9yeSBJRFxyXG4gKi9cclxuZXhwb3J0IGNvbnN0IGFkZEludmVudG9yeUl0ZW0gPSBhc3luYyAoaXRlbSwgaG91c2Vob2xkSWQpID0+IHtcclxuICB0cnkge1xyXG4gICAgaWYgKCFob3VzZWhvbGRJZCkge1xyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0hvdXNlaG9sZCBJRCBpcyByZXF1aXJlZCB0byBhZGQgaW52ZW50b3J5IGl0ZW1zJylcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBkYiA9IGF3YWl0IGluaXREQigpXHJcbiAgICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKClcclxuXHJcbiAgICBjb25zdCBpdGVtRGF0YSA9IHtcclxuICAgICAgLi4uaXRlbSxcclxuICAgICAgaG91c2Vob2xkX2lkOiBob3VzZWhvbGRJZCxcclxuICAgICAgYWRkZWRBdDogbm93LFxyXG4gICAgICBsYXN0Q2hlY2tlZEF0OiBub3csXHJcbiAgICAgIG5vdGlmaWNhdGlvblNlbnQ6IGZhbHNlLFxyXG4gICAgICBzeW5jZWRBdDogbnVsbCxcclxuICAgICAgX2RlbGV0ZWQ6IGZhbHNlLFxyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IHR4ID0gZGIudHJhbnNhY3Rpb24oJ2ludmVudG9yeScsICdyZWFkd3JpdGUnKVxyXG4gICAgY29uc3QgaWQgPSBhd2FpdCB0eC5zdG9yZS5hZGQoaXRlbURhdGEpXHJcbiAgICBhd2FpdCB0eC5kb25lXHJcblxyXG4gICAgLy8gVHJhY2sgY2hhbmdlIGZvciBzeW5jXHJcbiAgICBhd2FpdCB0cmFja0NoYW5nZSgnaW52ZW50b3J5JywgaWQsICdjcmVhdGUnKVxyXG5cclxuICAgIHJldHVybiBpZFxyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gYWRkIGludmVudG9yeSBpdGVtOicsIGVycm9yKVxyXG4gICAgdGhyb3cgbmV3IEVycm9yKGBGYWlsZWQgdG8gYWRkIGludmVudG9yeSBpdGVtOiAke2Vycm9yLm1lc3NhZ2V9YClcclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBHZXQgYWxsIGludmVudG9yeSBpdGVtcyBmb3IgYSBob3VzZWhvbGQgKGV4Y2x1ZGluZyBkZWxldGVkKVxyXG4gKiBAcGFyYW0ge3N0cmluZ30gaG91c2Vob2xkSWQgLSBIb3VzZWhvbGQgSURcclxuICogQHBhcmFtIHtib29sZWFufSBpbmNsdWRlRGVsZXRlZCAtIEluY2x1ZGUgc29mdC1kZWxldGVkIGl0ZW1zXHJcbiAqIEByZXR1cm5zIHtBcnJheX0gQXJyYXkgb2YgaW52ZW50b3J5IGl0ZW1zXHJcbiAqL1xyXG5leHBvcnQgY29uc3QgZ2V0SW52ZW50b3J5ID0gYXN5bmMgKGhvdXNlaG9sZElkLCBpbmNsdWRlRGVsZXRlZCA9IGZhbHNlKSA9PiB7XHJcbiAgdHJ5IHtcclxuICAgIGlmICghaG91c2Vob2xkSWQpIHtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdIb3VzZWhvbGQgSUQgaXMgcmVxdWlyZWQgdG8gcmV0cmlldmUgaW52ZW50b3J5JylcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBkYiA9IGF3YWl0IGluaXREQigpXHJcbiAgICBjb25zdCBpdGVtcyA9IGF3YWl0IGRiLmdldEFsbEZyb21JbmRleCgnaW52ZW50b3J5JywgJ2hvdXNlaG9sZF9pZCcsIGhvdXNlaG9sZElkKVxyXG5cclxuICAgIGlmIChpbmNsdWRlRGVsZXRlZCkge1xyXG4gICAgICByZXR1cm4gaXRlbXNcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gaXRlbXMuZmlsdGVyKChpdGVtKSA9PiAhaXRlbS5fZGVsZXRlZClcclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIGdldCBpbnZlbnRvcnk6JywgZXJyb3IpXHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoYEZhaWxlZCB0byByZXRyaWV2ZSBpbnZlbnRvcnk6ICR7ZXJyb3IubWVzc2FnZX1gKVxyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIEdldCBpbnZlbnRvcnkgaXRlbXMgYnkgcHJvZHVjdCBJRFxyXG4gKiBAcGFyYW0ge251bWJlcn0gcHJvZHVjdElkIC0gUHJvZHVjdCBJRFxyXG4gKiBAcmV0dXJucyB7QXJyYXl9IEFycmF5IG9mIGludmVudG9yeSBpdGVtc1xyXG4gKi9cclxuZXhwb3J0IGNvbnN0IGdldEludmVudG9yeUJ5UHJvZHVjdCA9IGFzeW5jIChwcm9kdWN0SWQpID0+IHtcclxuICB0cnkge1xyXG4gICAgY29uc3QgZGIgPSBhd2FpdCBpbml0REIoKVxyXG4gICAgY29uc3QgaXRlbXMgPSBhd2FpdCBkYi5nZXRBbGxGcm9tSW5kZXgoJ2ludmVudG9yeScsICdwcm9kdWN0SWQnLCBwcm9kdWN0SWQpXHJcbiAgICByZXR1cm4gaXRlbXMuZmlsdGVyKChpdGVtKSA9PiAhaXRlbS5fZGVsZXRlZClcclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIGdldCBpbnZlbnRvcnkgYnkgcHJvZHVjdDonLCBlcnJvcilcclxuICAgIHRocm93IG5ldyBFcnJvcihgRmFpbGVkIHRvIHJldHJpZXZlIGludmVudG9yeTogJHtlcnJvci5tZXNzYWdlfWApXHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogR2V0IGVucmljaGVkIGludmVudG9yeSBpdGVtcyAoaW52ZW50b3J5ICsgcHJvZHVjdCBkYXRhKSBmb3IgYSBob3VzZWhvbGRcclxuICogTWVyZ2VzIGludmVudG9yeSBpdGVtcyB3aXRoIHRoZWlyIGNvcnJlc3BvbmRpbmcgcHJvZHVjdCB0ZW1wbGF0ZXNcclxuICogdG8gaW5jbHVkZSBpbWFnZXMgYW5kIG90aGVyIHByb2R1Y3QgbWV0YWRhdGFcclxuICogQHBhcmFtIHtzdHJpbmd9IGhvdXNlaG9sZElkIC0gSG91c2Vob2xkIElEXHJcbiAqIEBwYXJhbSB7Ym9vbGVhbn0gaW5jbHVkZURlbGV0ZWQgLSBJbmNsdWRlIHNvZnQtZGVsZXRlZCBpdGVtc1xyXG4gKiBAcmV0dXJucyB7QXJyYXl9IEFycmF5IG9mIGVucmljaGVkIGludmVudG9yeSBpdGVtc1xyXG4gKi9cclxuZXhwb3J0IGNvbnN0IGdldEVucmljaGVkSW52ZW50b3J5ID0gYXN5bmMgKGhvdXNlaG9sZElkLCBpbmNsdWRlRGVsZXRlZCA9IGZhbHNlKSA9PiB7XHJcbiAgdHJ5IHtcclxuICAgIGlmICghaG91c2Vob2xkSWQpIHtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdIb3VzZWhvbGQgSUQgaXMgcmVxdWlyZWQgdG8gcmV0cmlldmUgaW52ZW50b3J5JylcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBkYiA9IGF3YWl0IGluaXREQigpXHJcblxyXG4gICAgLy8gR2V0IGFsbCBpbnZlbnRvcnkgaXRlbXMgZm9yIGhvdXNlaG9sZFxyXG4gICAgY29uc3QgaW52ZW50b3J5SXRlbXMgPSBhd2FpdCBkYi5nZXRBbGxGcm9tSW5kZXgoJ2ludmVudG9yeScsICdob3VzZWhvbGRfaWQnLCBob3VzZWhvbGRJZClcclxuICAgIGNvbnN0IGZpbHRlcmVkSW52ZW50b3J5ID0gaW5jbHVkZURlbGV0ZWRcclxuICAgICAgPyBpbnZlbnRvcnlJdGVtc1xyXG4gICAgICA6IGludmVudG9yeUl0ZW1zLmZpbHRlcigoaXRlbSkgPT4gIWl0ZW0uX2RlbGV0ZWQpXHJcblxyXG4gICAgLy8gR2V0IGFsbCBwcm9kdWN0cyBmb3IgbG9va3VwXHJcbiAgICBjb25zdCBwcm9kdWN0cyA9IGF3YWl0IGRiLmdldEFsbCgncHJvZHVjdHMnKVxyXG4gICAgY29uc3QgcHJvZHVjdE1hcCA9IG5ldyBNYXAocHJvZHVjdHMubWFwKChwKSA9PiBbcC5pZCwgcF0pKVxyXG5cclxuICAgIC8vIEVucmljaCBpbnZlbnRvcnkgaXRlbXMgd2l0aCBwcm9kdWN0IGRhdGFcclxuICAgIHJldHVybiBmaWx0ZXJlZEludmVudG9yeS5tYXAoKGl0ZW0pID0+IHtcclxuICAgICAgY29uc3QgcHJvZHVjdCA9IGl0ZW0ucHJvZHVjdElkID8gcHJvZHVjdE1hcC5nZXQoaXRlbS5wcm9kdWN0SWQpIDogbnVsbFxyXG5cclxuICAgICAgcmV0dXJuIHtcclxuICAgICAgICAuLi5pdGVtLFxyXG4gICAgICAgIC8vIEVucmljaCB3aXRoIHByb2R1Y3QgZGF0YSBpZiBhdmFpbGFibGVcclxuICAgICAgICBpbWFnZVVybDogcHJvZHVjdD8uaW1hZ2VVcmwgfHwgaXRlbS5pbWFnZVVybCB8fCBudWxsLFxyXG4gICAgICAgIGltYWdlQmxvYjogcHJvZHVjdD8uaW1hZ2VCbG9iIHx8IGl0ZW0uaW1hZ2VCbG9iIHx8IG51bGwsXHJcbiAgICAgICAgYnJhbmQ6IHByb2R1Y3Q/LmJyYW5kIHx8IGl0ZW0uYnJhbmQgfHwgbnVsbCxcclxuICAgICAgICBiYXJjb2RlOiBwcm9kdWN0Py5iYXJjb2RlIHx8IGl0ZW0uYmFyY29kZSB8fCBudWxsLFxyXG4gICAgICAgIGFsbGVyZ2VuczogcHJvZHVjdD8uYWxsZXJnZW5zIHx8IGl0ZW0uYWxsZXJnZW5zIHx8IG51bGwsXHJcbiAgICAgICAgbnV0cml0aW9uOiBwcm9kdWN0Py5udXRyaXRpb24gfHwgaXRlbS5udXRyaXRpb24gfHwgbnVsbCxcclxuICAgICAgICBpbmdyZWRpZW50czogcHJvZHVjdD8uaW5ncmVkaWVudHMgfHwgaXRlbS5pbmdyZWRpZW50cyB8fCBudWxsLFxyXG4gICAgICAgIC8vIEtlZXAgb3JpZ2luYWwgaW52ZW50b3J5IGRhdGEgYXMgcHJpbWFyeVxyXG4gICAgICAgIHByb2R1Y3RUZW1wbGF0ZTogcHJvZHVjdCB8fCBudWxsLFxyXG4gICAgICB9XHJcbiAgICB9KVxyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gZ2V0IGVucmljaGVkIGludmVudG9yeTonLCBlcnJvcilcclxuICAgIHRocm93IG5ldyBFcnJvcihgRmFpbGVkIHRvIHJldHJpZXZlIGVucmljaGVkIGludmVudG9yeTogJHtlcnJvci5tZXNzYWdlfWApXHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogVXBkYXRlIGludmVudG9yeSBpdGVtXHJcbiAqIEBwYXJhbSB7bnVtYmVyfSBpZCAtIEludmVudG9yeSBJRFxyXG4gKiBAcGFyYW0ge09iamVjdH0gdXBkYXRlcyAtIEZpZWxkcyB0byB1cGRhdGVcclxuICovXHJcbmV4cG9ydCBjb25zdCB1cGRhdGVJbnZlbnRvcnlJdGVtID0gYXN5bmMgKGlkLCB1cGRhdGVzKSA9PiB7XHJcbiAgdHJ5IHtcclxuICAgIGNvbnN0IGRiID0gYXdhaXQgaW5pdERCKClcclxuICAgIGNvbnN0IHR4ID0gZGIudHJhbnNhY3Rpb24oJ2ludmVudG9yeScsICdyZWFkd3JpdGUnKVxyXG4gICAgY29uc3QgaXRlbSA9IGF3YWl0IHR4LnN0b3JlLmdldChpZClcclxuXHJcbiAgICBpZiAoIWl0ZW0pIHtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKGBJbnZlbnRvcnkgaXRlbSB3aXRoIElEICR7aWR9IG5vdCBmb3VuZGApXHJcbiAgICB9XHJcblxyXG4gICAgLy8gTGlnaHR3ZWlnaHQgcHJlLXdyaXRlIGNoZWNrOiBpZiBjbG91ZCBjb25maWd1cmVkIGFuZCBhdXRoZW50aWNhdGVkLFxyXG4gICAgLy8gZmV0Y2ggcmVtb3RlJ3MgdXBkYXRlZF9hdCBhbmQgaWYgaXQncyBuZXdlciB0aGFuIGxvY2FsIHN5bmNlZEF0LCBhYm9ydCB3aXRoIGNvbmZsaWN0LlxyXG4gICAgdHJ5IHtcclxuICAgICAgaWYgKGlzTmhvc3RDb25maWd1cmVkKCkgJiYgaXNOaG9zdEF1dGhlbnRpY2F0ZWQoKSkge1xyXG4gICAgICAgIGNvbnN0IHJlbW90ZSA9IGF3YWl0IGdldEludmVudG9yeUJ5SWQoaWQpXHJcbiAgICAgICAgaWYgKHJlbW90ZSAmJiByZW1vdGUudXBkYXRlZF9hdCAmJiBpdGVtLnN5bmNlZEF0ICYmIG5ldyBEYXRlKHJlbW90ZS51cGRhdGVkX2F0KSA+IG5ldyBEYXRlKGl0ZW0uc3luY2VkQXQpKSB7XHJcbiAgICAgICAgICBjb25zdCBlcnIgPSBuZXcgRXJyb3IoJ0NvbmZsaWN0OiByZW1vdGUgdmVyc2lvbiBpcyBuZXdlciB0aGFuIGxvY2FsIGNvcHknKVxyXG4gICAgICAgICAgZXJyLmNvZGUgPSAnY29uZmxpY3QnXHJcbiAgICAgICAgICB0aHJvdyBlcnJcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgIH0gY2F0Y2ggKHByZWNoZWNrRXJyKSB7XHJcbiAgICAgIC8vIElmIHByZWNoZWNrIHRocm93cyBhIGNvbmZsaWN0IGVycm9yLCBidWJibGUgdXAuIE90aGVyd2lzZSBsb2cgYW5kIGNvbnRpbnVlLlxyXG4gICAgICBpZiAocHJlY2hlY2tFcnIgJiYgcHJlY2hlY2tFcnIuY29kZSA9PT0gJ2NvbmZsaWN0JykgdGhyb3cgcHJlY2hlY2tFcnJcclxuICAgICAgY29uc29sZS53YXJuKCdQcmUtd3JpdGUgcmVtb3RlIGNoZWNrIGZhaWxlZDsgcHJvY2VlZGluZyB3aXRoIGxvY2FsIHVwZGF0ZTonLCBwcmVjaGVja0Vyci5tZXNzYWdlKVxyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IHVwZGF0ZWRJdGVtID0ge1xyXG4gICAgICAuLi5pdGVtLFxyXG4gICAgICAuLi51cGRhdGVzLFxyXG4gICAgICBsYXN0Q2hlY2tlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgIHN5bmNlZEF0OiBudWxsLCAvLyBNYXJrIGFzIG5lZWRpbmcgc3luY1xyXG4gICAgfVxyXG5cclxuICAgIGF3YWl0IHR4LnN0b3JlLnB1dCh1cGRhdGVkSXRlbSlcclxuICAgIGF3YWl0IHR4LmRvbmVcclxuXHJcbiAgICAvLyBUcmFjayBjaGFuZ2UgZm9yIHN5bmNcclxuICAgIGF3YWl0IHRyYWNrQ2hhbmdlKCdpbnZlbnRvcnknLCBpZCwgJ3VwZGF0ZScpXHJcbiAgICAvLyBUcmlnZ2VyIGJhY2tncm91bmQgc3luYyAoYmVzdC1lZmZvcnQpXHJcbiAgICB0cnkge1xyXG4gICAgICBzeW5jVG9DbG91ZCgpLmNhdGNoKChlKSA9PiBjb25zb2xlLndhcm4oJ0JhY2tncm91bmQgc3luYyBmYWlsZWQ6JywgZS5tZXNzYWdlIHx8IGUpKVxyXG4gICAgfSBjYXRjaCAoZSkge1xyXG4gICAgICBjb25zb2xlLndhcm4oJ0ZhaWxlZCB0byB0cmlnZ2VyIGJhY2tncm91bmQgc3luYzonLCBlLm1lc3NhZ2UgfHwgZSlcclxuICAgIH1cclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIHVwZGF0ZSBpbnZlbnRvcnkgaXRlbTonLCBlcnJvcilcclxuICAgIHRocm93IG5ldyBFcnJvcihgRmFpbGVkIHRvIHVwZGF0ZSBpbnZlbnRvcnkgaXRlbTogJHtlcnJvci5tZXNzYWdlfWApXHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogU3luYyBwZW5kaW5nIGxvY2FsIGNoYW5nZXMgdG8gdGhlIGNsb3VkIHZpYSBHcmFwaFFMXHJcbiAqIC0gQ3VycmVudGx5IGhhbmRsZXMgaW52ZW50b3J5IGNyZWF0ZS91cGRhdGUvZGVsZXRlIGluIGJhdGNoZXNcclxuICovXHJcbmV4cG9ydCBjb25zdCBzeW5jVG9DbG91ZCA9IGFzeW5jICgpID0+IHtcclxuICB0cnkge1xyXG4gICAgaWYgKCFpc05ob3N0Q29uZmlndXJlZCgpIHx8ICFpc05ob3N0QXV0aGVudGljYXRlZCgpKSB7XHJcbiAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCByZWFzb246ICdOb3QgY29uZmlndXJlZCBvciBub3QgYXV0aGVudGljYXRlZCcgfVxyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IHBlbmRpbmcgPSBhd2FpdCBnZXRQZW5kaW5nQ2hhbmdlcygpXHJcbiAgICBpZiAoIXBlbmRpbmcgfHwgcGVuZGluZy5sZW5ndGggPT09IDApIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIHN5bmNlZDogMCB9XHJcblxyXG4gICAgLy8gR3JvdXAgaW52ZW50b3J5IGNoYW5nZXNcclxuICAgIGNvbnN0IGludmVudG9yeVVwc2VydHMgPSBbXVxyXG4gICAgY29uc3QgaW52ZW50b3J5RGVsZXRlcyA9IFtdXHJcblxyXG4gICAgZm9yIChjb25zdCBjaGFuZ2Ugb2YgcGVuZGluZykge1xyXG4gICAgICBpZiAoY2hhbmdlLnRhYmxlICE9PSAnaW52ZW50b3J5JykgY29udGludWVcclxuXHJcbiAgICAgIGlmIChjaGFuZ2Uub3BlcmF0aW9uID09PSAnZGVsZXRlJykge1xyXG4gICAgICAgIGludmVudG9yeURlbGV0ZXMucHVzaChjaGFuZ2UucmVjb3JkSWQpXHJcbiAgICAgIH0gZWxzZSBpZiAoY2hhbmdlLmRhdGEpIHtcclxuICAgICAgICAvLyBNYXAgbG9jYWwgZGF0YSB0byBhIHNlcnZlci1mcmllbmRseSBzaGFwZS4gU2VydmVyIHNjaGVtYSBtYXkgbmVlZCB0byBhY2NlcHQgdGhlc2UgZmllbGRzLlxyXG4gICAgICAgIGNvbnN0IG9iaiA9IHtcclxuICAgICAgICAgIGlkOiBjaGFuZ2UuZGF0YS5pZCxcclxuICAgICAgICAgIGhvdXNlaG9sZF9pZDogY2hhbmdlLmRhdGEuaG91c2Vob2xkX2lkLFxyXG4gICAgICAgICAgcHJvZHVjdF9pZDogY2hhbmdlLmRhdGEucHJvZHVjdElkIHx8IG51bGwsXHJcbiAgICAgICAgICBxdWFudGl0eTogY2hhbmdlLmRhdGEucXVhbnRpdHkgfHwgbnVsbCxcclxuICAgICAgICAgIGV4cGlyeV9kYXRlOiBjaGFuZ2UuZGF0YS5leHBpcnlEYXRlIHx8IG51bGwsXHJcbiAgICAgICAgICBhZGRlZF9hdDogY2hhbmdlLmRhdGEuYWRkZWRBdCB8fCBudWxsLFxyXG4gICAgICAgICAgX2RlbGV0ZWQ6ICEhY2hhbmdlLmRhdGEuX2RlbGV0ZWQsXHJcbiAgICAgICAgICBhbGxvd0dyYWNlUGVyaW9kOiAhIWNoYW5nZS5kYXRhLmFsbG93R3JhY2VQZXJpb2QsXHJcbiAgICAgICAgICBncmFjZVBlcmlvZE1vbnRoczogY2hhbmdlLmRhdGEuZ3JhY2VQZXJpb2RNb250aHMgfHwgbnVsbCxcclxuICAgICAgICAgIGltYWdlVXJsOiBjaGFuZ2UuZGF0YS5pbWFnZVVybCB8fCBudWxsLFxyXG4gICAgICAgIH1cclxuICAgICAgICBpbnZlbnRvcnlVcHNlcnRzLnB1c2gob2JqKVxyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgbGV0IHN5bmNlZENvdW50ID0gMFxyXG5cclxuICAgIC8vIFNlbmQgdXBzZXJ0c1xyXG4gICAgaWYgKGludmVudG9yeVVwc2VydHMubGVuZ3RoID4gMCkge1xyXG4gICAgICBjb25zdCByZXMgPSBhd2FpdCB1cHNlcnRJbnZlbnRvcnlCYXRjaChpbnZlbnRvcnlVcHNlcnRzKVxyXG4gICAgICBzeW5jZWRDb3VudCArPSByZXMubGVuZ3RoIHx8IDBcclxuICAgICAgLy8gTWFyayBsb2NhbCBsb2dzIGFzIHN5bmNlZFxyXG4gICAgICBmb3IgKGNvbnN0IHVwIG9mIGludmVudG9yeVVwc2VydHMpIHtcclxuICAgICAgICBhd2FpdCBtYXJrU3luY2VkKCdpbnZlbnRvcnknLCB1cC5pZClcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIFNlbmQgZGVsZXRlc1xyXG4gICAgaWYgKGludmVudG9yeURlbGV0ZXMubGVuZ3RoID4gMCkge1xyXG4gICAgICBjb25zdCBkZWxSZXMgPSBhd2FpdCBkZWxldGVJbnZlbnRvcnlCYXRjaChpbnZlbnRvcnlEZWxldGVzKVxyXG4gICAgICBzeW5jZWRDb3VudCArPSBpbnZlbnRvcnlEZWxldGVzLmxlbmd0aFxyXG4gICAgICBmb3IgKGNvbnN0IGlkIG9mIGludmVudG9yeURlbGV0ZXMpIHtcclxuICAgICAgICBhd2FpdCBtYXJrU3luY2VkKCdpbnZlbnRvcnknLCBpZClcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIFVwZGF0ZSBsYXN0IHN5bmMgc2V0dGluZyAoZ2xvYmFsKVxyXG4gICAgYXdhaXQgc2V0U2V0dGluZygnbGFzdFN5bmMnLCBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCkpXHJcblxyXG4gICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgc3luY2VkOiBzeW5jZWRDb3VudCB9XHJcbiAgfSBjYXRjaCAoZXJyKSB7XHJcbiAgICBjb25zb2xlLmVycm9yKCdzeW5jVG9DbG91ZCBmYWlsZWQ6JywgZXJyKVxyXG4gICAgdGhyb3cgZXJyXHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogRGVsZXRlIGludmVudG9yeSBpdGVtIChzb2Z0IGRlbGV0ZSlcclxuICogQHBhcmFtIHtudW1iZXJ9IGlkIC0gSW52ZW50b3J5IElEXHJcbiAqIEBwYXJhbSB7Ym9vbGVhbn0gaGFyZCAtIFBlcm1hbmVudGx5IGRlbGV0ZSAoZGVmYXVsdDogZmFsc2UpXHJcbiAqL1xyXG5leHBvcnQgY29uc3QgZGVsZXRlSW52ZW50b3J5SXRlbSA9IGFzeW5jIChpZCwgaGFyZCA9IGZhbHNlKSA9PiB7XHJcbiAgdHJ5IHtcclxuICAgIGNvbnN0IGRiID0gYXdhaXQgaW5pdERCKClcclxuICAgIGNvbnN0IHR4ID0gZGIudHJhbnNhY3Rpb24oJ2ludmVudG9yeScsICdyZWFkd3JpdGUnKVxyXG5cclxuICAgIGlmIChoYXJkKSB7XHJcbiAgICAgIGF3YWl0IHR4LnN0b3JlLmRlbGV0ZShpZClcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIGNvbnN0IGl0ZW0gPSBhd2FpdCB0eC5zdG9yZS5nZXQoaWQpXHJcbiAgICAgIGlmIChpdGVtKSB7XHJcbiAgICAgICAgaXRlbS5fZGVsZXRlZCA9IHRydWVcclxuICAgICAgICBpdGVtLmxhc3RDaGVja2VkQXQgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKClcclxuICAgICAgICBpdGVtLnN5bmNlZEF0ID0gbnVsbFxyXG4gICAgICAgIGF3YWl0IHR4LnN0b3JlLnB1dChpdGVtKVxyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgYXdhaXQgdHguZG9uZVxyXG5cclxuICAgIC8vIFRyYWNrIGNoYW5nZSBmb3Igc3luY1xyXG4gICAgYXdhaXQgdHJhY2tDaGFuZ2UoJ2ludmVudG9yeScsIGlkLCAnZGVsZXRlJylcclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIGRlbGV0ZSBpbnZlbnRvcnkgaXRlbTonLCBlcnJvcilcclxuICAgIHRocm93IG5ldyBFcnJvcihgRmFpbGVkIHRvIGRlbGV0ZSBpbnZlbnRvcnkgaXRlbTogJHtlcnJvci5tZXNzYWdlfWApXHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogVXBzZXJ0IGludmVudG9yeSBpdGVtIChpbnNlcnQgb3IgdXBkYXRlKVxyXG4gKiBVc2VkIGJ5IHN5bmMgZW5naW5lIHRvIG1lcmdlIHJlbW90ZSBkYXRhXHJcbiAqIEBwYXJhbSB7T2JqZWN0fSBpdGVtIC0gSW52ZW50b3J5IGl0ZW0gZGF0YSB3aXRoIGlkXHJcbiAqL1xyXG5leHBvcnQgY29uc3QgdXBzZXJ0SW52ZW50b3J5SXRlbSA9IGFzeW5jIChpdGVtKSA9PiB7XHJcbiAgdHJ5IHtcclxuICAgIGNvbnN0IGRiID0gYXdhaXQgaW5pdERCKClcclxuICAgIGNvbnN0IHR4ID0gZGIudHJhbnNhY3Rpb24oJ2ludmVudG9yeScsICdyZWFkd3JpdGUnKVxyXG4gICAgY29uc3QgZXhpc3RpbmcgPSBhd2FpdCB0eC5zdG9yZS5nZXQoaXRlbS5pZClcclxuXHJcbiAgICBsZXQgaXRlbURhdGFcclxuICAgIGlmIChleGlzdGluZykge1xyXG4gICAgICAvLyBNZXJnZSwga2VlcGluZyBuZXdlciBkYXRhIChjb25mbGljdCByZXNvbHV0aW9uKVxyXG4gICAgICBjb25zdCBleGlzdGluZ1RpbWUgPSBuZXcgRGF0ZShcclxuICAgICAgICBleGlzdGluZy51cGRhdGVkX2F0IHx8IGV4aXN0aW5nLnVwZGF0ZWRBdCB8fCBleGlzdGluZy5sYXN0Q2hlY2tlZEF0IHx8IDAsXHJcbiAgICAgIClcclxuICAgICAgY29uc3QgcmVtb3RlVGltZSA9IG5ldyBEYXRlKGl0ZW0udXBkYXRlZF9hdCB8fCBpdGVtLnVwZGF0ZWRBdCB8fCBpdGVtLmxhc3RDaGVja2VkQXQgfHwgMClcclxuXHJcbiAgICAgIGl0ZW1EYXRhID0gcmVtb3RlVGltZSA+PSBleGlzdGluZ1RpbWUgPyBpdGVtIDogZXhpc3RpbmdcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIGl0ZW1EYXRhID0gaXRlbVxyXG4gICAgfVxyXG5cclxuICAgIGF3YWl0IHR4LnN0b3JlLnB1dChpdGVtRGF0YSlcclxuICAgIGF3YWl0IHR4LmRvbmVcclxuXHJcbiAgICByZXR1cm4gaXRlbURhdGEuaWRcclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIHVwc2VydCBpbnZlbnRvcnkgaXRlbTonLCBlcnJvcilcclxuICAgIHRocm93IG5ldyBFcnJvcihgRmFpbGVkIHRvIHVwc2VydCBpbnZlbnRvcnkgaXRlbTogJHtlcnJvci5tZXNzYWdlfWApXHJcbiAgfVxyXG59XHJcblxyXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbi8vIFNUQVRJU1RJQ1MgJiBBTkFMWVRJQ1NcclxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG5cclxuLyoqXHJcbiAqIEdldCBpbnZlbnRvcnkgc3RhdGlzdGljc1xyXG4gKiBAcmV0dXJucyB7T2JqZWN0fSBTdGF0cyBvYmplY3Qgd2l0aCB0b3RhbEl0ZW1zIGFuZCBleHBpcmluZ1Nvb25cclxuICovXHJcbmV4cG9ydCBjb25zdCBnZXRJbnZlbnRvcnlTdGF0cyA9IGFzeW5jIChob3VzZWhvbGRJZCkgPT4ge1xyXG4gIHRyeSB7XHJcbiAgICBpZiAoIWhvdXNlaG9sZElkKSB7XHJcbiAgICAgIHRocm93IG5ldyBFcnJvcignSG91c2Vob2xkIElEIGlzIHJlcXVpcmVkIHRvIGdldCBpbnZlbnRvcnkgc3RhdHMnKVxyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IGRiID0gYXdhaXQgaW5pdERCKClcclxuICAgIGNvbnN0IGludmVudG9yeSA9IGF3YWl0IGRiLmdldEFsbEZyb21JbmRleCgnaW52ZW50b3J5JywgJ2hvdXNlaG9sZF9pZCcsIGhvdXNlaG9sZElkKVxyXG4gICAgY29uc3QgYWN0aXZlSW52ZW50b3J5ID0gaW52ZW50b3J5LmZpbHRlcigoaXRlbSkgPT4gIWl0ZW0uX2RlbGV0ZWQpXHJcblxyXG4gICAgY29uc3Qgbm93ID0gbmV3IERhdGUoKVxyXG4gICAgY29uc3QgdGhpcnR5RGF5c0Zyb21Ob3cgPSBuZXcgRGF0ZShub3cuZ2V0VGltZSgpICsgMzAgKiAyNCAqIDYwICogNjAgKiAxMDAwKVxyXG5cclxuICAgIHJldHVybiB7XHJcbiAgICAgIHRvdGFsSXRlbXM6IGFjdGl2ZUludmVudG9yeS5sZW5ndGgsXHJcbiAgICAgIGV4cGlyaW5nU29vbjogYWN0aXZlSW52ZW50b3J5LmZpbHRlcigoaXRlbSkgPT4ge1xyXG4gICAgICAgIGlmICghaXRlbS5leHBpcnlEYXRlKSByZXR1cm4gZmFsc2VcclxuICAgICAgICBjb25zdCBleHBpcnlEYXRlID0gbmV3IERhdGUoaXRlbS5leHBpcnlEYXRlKVxyXG4gICAgICAgIHJldHVybiBleHBpcnlEYXRlIDw9IHRoaXJ0eURheXNGcm9tTm93ICYmIGV4cGlyeURhdGUgPiBub3dcclxuICAgICAgfSkubGVuZ3RoLFxyXG4gICAgfVxyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gZ2V0IGludmVudG9yeSBzdGF0czonLCBlcnJvcilcclxuICAgIHJldHVybiB7IHRvdGFsSXRlbXM6IDAsIGV4cGlyaW5nU29vbjogMCB9XHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogR2V0IGludmVudG9yeSBpdGVtcyBncm91cGVkIGJ5IERTQiBjYXRlZ29yeSBmb3IgYSBob3VzZWhvbGRcclxuICogQHBhcmFtIHtzdHJpbmd9IGhvdXNlaG9sZElkIC0gSG91c2Vob2xkIElEXHJcbiAqIEByZXR1cm5zIHtPYmplY3R9IE9iamVjdCB3aXRoIERTQiBjYXRlZ29yeSBrZXlzIGFuZCBpdGVtIHF1YW50aXRpZXNcclxuICovXHJcbmV4cG9ydCBjb25zdCBnZXRJbnZlbnRvcnlCeURzYkNhdGVnb3J5ID0gYXN5bmMgKGhvdXNlaG9sZElkKSA9PiB7XHJcbiAgdHJ5IHtcclxuICAgIGlmICghaG91c2Vob2xkSWQpIHtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdIb3VzZWhvbGQgSUQgaXMgcmVxdWlyZWQgdG8gZ2V0IGludmVudG9yeSBieSBjYXRlZ29yeScpXHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgZGIgPSBhd2FpdCBpbml0REIoKVxyXG4gICAgY29uc3QgaW52ZW50b3J5ID0gYXdhaXQgZGIuZ2V0QWxsRnJvbUluZGV4KCdpbnZlbnRvcnknLCAnaG91c2Vob2xkX2lkJywgaG91c2Vob2xkSWQpXHJcbiAgICBjb25zdCBhY3RpdmVJbnZlbnRvcnkgPSBpbnZlbnRvcnkuZmlsdGVyKChpdGVtKSA9PiAhaXRlbS5fZGVsZXRlZClcclxuXHJcbiAgICAvLyBNYXAgc3VwcGx5IGNhdGVnb3JpZXMgdG8gRFNCIGNhdGVnb3JpZXNcclxuICAgIGNvbnN0IHsgZ2V0RHNiQ2F0ZWdvcnkgfSA9IHJlcXVpcmUoJy4vY29uc3RhbnRzL2NhdGVnb3JpZXMnKVxyXG5cclxuICAgIGNvbnN0IGNhdGVnb3J5Q291bnRzID0ge1xyXG4gICAgICB3YXRlcjogMCxcclxuICAgICAgZm9vZDogMCxcclxuICAgICAgbWVkaWNhdGlvbnM6IDAsXHJcbiAgICAgIGZpcnN0QWlkOiAwLFxyXG4gICAgICBoeWdpZW5lOiAwLFxyXG4gICAgICB3YXJtdGg6IDAsXHJcbiAgICAgIGxpZ2h0OiAwLFxyXG4gICAgICBkb2N1bWVudHM6IDAsXHJcbiAgICAgIHRvb2xzOiAwLFxyXG4gICAgfVxyXG5cclxuICAgIGFjdGl2ZUludmVudG9yeS5mb3JFYWNoKChpdGVtKSA9PiB7XHJcbiAgICAgIGNvbnN0IGRzYkNhdGVnb3J5ID0gZ2V0RHNiQ2F0ZWdvcnkoaXRlbS5jYXRlZ29yeSlcclxuICAgICAgaWYgKGRzYkNhdGVnb3J5ICYmIGNhdGVnb3J5Q291bnRzLmhhc093blByb3BlcnR5KGRzYkNhdGVnb3J5KSkge1xyXG4gICAgICAgIC8vIEZvciBtb3N0IGl0ZW1zLCBjb3VudCAxIHBlciBpdGVtLiBGb3Igd2F0ZXIvZm9vZCwgdXNlIHF1YW50aXR5IGlmIGF2YWlsYWJsZVxyXG4gICAgICAgIGNvbnN0IHF1YW50aXR5VG9BZGQgPSBpdGVtLnF1YW50aXR5IHx8IDFcclxuICAgICAgICBpZiAoZHNiQ2F0ZWdvcnkgPT09ICd3YXRlcicgfHwgZHNiQ2F0ZWdvcnkgPT09ICdmb29kJykge1xyXG4gICAgICAgICAgY2F0ZWdvcnlDb3VudHNbZHNiQ2F0ZWdvcnldICs9IHF1YW50aXR5VG9BZGRcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgY2F0ZWdvcnlDb3VudHNbZHNiQ2F0ZWdvcnldICs9IDFcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgIH0pXHJcblxyXG4gICAgcmV0dXJuIGNhdGVnb3J5Q291bnRzXHJcbiAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byBnZXQgaW52ZW50b3J5IGJ5IERTQiBjYXRlZ29yeTonLCBlcnJvcilcclxuICAgIHJldHVybiB7XHJcbiAgICAgIHdhdGVyOiAwLFxyXG4gICAgICBmb29kOiAwLFxyXG4gICAgICBtZWRpY2F0aW9uczogMCxcclxuICAgICAgZmlyc3RBaWQ6IDAsXHJcbiAgICAgIGh5Z2llbmU6IDAsXHJcbiAgICAgIHdhcm10aDogMCxcclxuICAgICAgbGlnaHQ6IDAsXHJcbiAgICAgIGRvY3VtZW50czogMCxcclxuICAgICAgdG9vbHM6IDAsXHJcbiAgICB9XHJcbiAgfVxyXG59XHJcblxyXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbi8vIFNFVFRJTkdTIE9QRVJBVElPTlNcclxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG5cclxuLyoqXHJcbiAqIEdldCBzZXR0aW5nIHZhbHVlXHJcbiAqIEBwYXJhbSB7c3RyaW5nfSBrZXkgLSBTZXR0aW5nIGtleVxyXG4gKiBAcmV0dXJucyB7Kn0gU2V0dGluZyB2YWx1ZSBvciBudWxsXHJcbiAqL1xyXG5leHBvcnQgY29uc3QgZ2V0U2V0dGluZyA9IGFzeW5jIChrZXkpID0+IHtcclxuICB0cnkge1xyXG4gICAgY29uc3QgZGIgPSBhd2FpdCBpbml0REIoKVxyXG4gICAgY29uc3Qgc2V0dGluZyA9IGF3YWl0IGRiLmdldCgnc2V0dGluZ3MnLCBrZXkpXHJcbiAgICByZXR1cm4gc2V0dGluZyA/IHNldHRpbmcudmFsdWUgOiBudWxsXHJcbiAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byBnZXQgc2V0dGluZzonLCBlcnJvcilcclxuICAgIHJldHVybiBudWxsXHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogU2V0IHNldHRpbmcgdmFsdWVcclxuICogQHBhcmFtIHtzdHJpbmd9IGtleSAtIFNldHRpbmcga2V5XHJcbiAqIEBwYXJhbSB7Kn0gdmFsdWUgLSBTZXR0aW5nIHZhbHVlXHJcbiAqL1xyXG5leHBvcnQgY29uc3Qgc2V0U2V0dGluZyA9IGFzeW5jIChrZXksIHZhbHVlKSA9PiB7XHJcbiAgdHJ5IHtcclxuICAgIGNvbnN0IGRiID0gYXdhaXQgaW5pdERCKClcclxuICAgIGNvbnN0IHR4ID0gZGIudHJhbnNhY3Rpb24oJ3NldHRpbmdzJywgJ3JlYWR3cml0ZScpXHJcblxyXG4gICAgYXdhaXQgdHguc3RvcmUucHV0KHtcclxuICAgICAga2V5LFxyXG4gICAgICB2YWx1ZSxcclxuICAgICAgdXBkYXRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgIHN5bmNlZEF0OiBudWxsLFxyXG4gICAgfSlcclxuXHJcbiAgICBhd2FpdCB0eC5kb25lXHJcblxyXG4gICAgLy8gVHJhY2sgY2hhbmdlIGZvciBzeW5jXHJcbiAgICBhd2FpdCB0cmFja0NoYW5nZSgnc2V0dGluZ3MnLCBrZXksICd1cGRhdGUnKVxyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gc2V0IHNldHRpbmc6JywgZXJyb3IpXHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoYEZhaWxlZCB0byBzYXZlIHNldHRpbmc6ICR7ZXJyb3IubWVzc2FnZX1gKVxyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIEZpZWxkIHByZWZlcmVuY2VzIGRlZmF1bHQgY29uZmlndXJhdGlvblxyXG4gKiBEZWZpbmVzIGFsbCBhdmFpbGFibGUgaW52ZW50b3J5IGZpZWxkcyBhbmQgdGhlaXIgZGVmYXVsdCB2aXNpYmlsaXR5L21hbmRhdG9yeSBzdGF0dXNcclxuICovXHJcbmNvbnN0IERFRkFVTFRfRklFTERfUFJFRkVSRU5DRVMgPSB7XHJcbiAgYmFyY29kZTogeyB2aXNpYmxlOiB0cnVlLCBtYW5kYXRvcnk6IGZhbHNlLCBsYWJlbDogJ0JhcmNvZGUnIH0sXHJcbiAgcHJvZHVjdE5hbWU6IHsgdmlzaWJsZTogdHJ1ZSwgbWFuZGF0b3J5OiB0cnVlLCBsYWJlbDogJ1Byb2R1Y3QgTmFtZScgfSxcclxuICBxdWFudGl0eTogeyB2aXNpYmxlOiB0cnVlLCBtYW5kYXRvcnk6IHRydWUsIGxhYmVsOiAnUXVhbnRpdHknIH0sXHJcbiAgdW5pdDogeyB2aXNpYmxlOiB0cnVlLCBtYW5kYXRvcnk6IGZhbHNlLCBsYWJlbDogJ1VuaXQnIH0sXHJcbiAgZXhwaXJ5RGF0ZTogeyB2aXNpYmxlOiB0cnVlLCBtYW5kYXRvcnk6IHRydWUsIGxhYmVsOiAnRXhwaXJ5IERhdGUnIH0sXHJcbiAgY2F0ZWdvcnk6IHsgdmlzaWJsZTogdHJ1ZSwgbWFuZGF0b3J5OiB0cnVlLCBsYWJlbDogJ0NhdGVnb3J5JyB9LFxyXG4gIGFsbGVyZ2VuczogeyB2aXNpYmxlOiB0cnVlLCBtYW5kYXRvcnk6IGZhbHNlLCBsYWJlbDogJ0FsbGVyZ2VucycgfSxcclxuICBzdG9yYWdlTG9jYXRpb246IHsgdmlzaWJsZTogdHJ1ZSwgbWFuZGF0b3J5OiBmYWxzZSwgbGFiZWw6ICdTdG9yYWdlIExvY2F0aW9uJyB9LFxyXG4gIGNvc3Q6IHsgdmlzaWJsZTogZmFsc2UsIG1hbmRhdG9yeTogZmFsc2UsIGxhYmVsOiAnQ29zdC9QcmljZScgfSxcclxuICBwdXJjaGFzZURhdGU6IHsgdmlzaWJsZTogdHJ1ZSwgbWFuZGF0b3J5OiBmYWxzZSwgbGFiZWw6ICdQdXJjaGFzZSBEYXRlJyB9LFxyXG4gIHByZWZlcnJlZENvbnN1bXB0aW9uRGF0ZTogeyB2aXNpYmxlOiBmYWxzZSwgbWFuZGF0b3J5OiBmYWxzZSwgbGFiZWw6ICdQcmVmZXJyZWQgQ29uc3VtcHRpb24gRGF0ZScgfSxcclxuICBzdXBwbGllcjogeyB2aXNpYmxlOiBmYWxzZSwgbWFuZGF0b3J5OiBmYWxzZSwgbGFiZWw6ICdTdXBwbGllci9Tb3VyY2UnIH0sXHJcbiAgc3RvcmFnZU5vdGVzOiB7IHZpc2libGU6IGZhbHNlLCBtYW5kYXRvcnk6IGZhbHNlLCBsYWJlbDogJ1N0b3JhZ2UgTm90ZXMnIH0sXHJcbiAgaXRlbVN0YXR1czogeyB2aXNpYmxlOiBmYWxzZSwgbWFuZGF0b3J5OiBmYWxzZSwgbGFiZWw6ICdJdGVtIFN0YXR1cycgfSxcclxuICBsb3ROdW1iZXI6IHsgdmlzaWJsZTogZmFsc2UsIG1hbmRhdG9yeTogZmFsc2UsIGxhYmVsOiAnTG90L0JhdGNoIE51bWJlcicgfSxcclxuICBudXRyaXRpb25JbmZvOiB7IHZpc2libGU6IGZhbHNlLCBtYW5kYXRvcnk6IGZhbHNlLCBsYWJlbDogJ051dHJpdGlvbmFsIFZhbHVlJyB9LFxyXG4gIGRpZXRhcnlSZXN0cmljdGlvbnM6IHsgdmlzaWJsZTogZmFsc2UsIG1hbmRhdG9yeTogZmFsc2UsIGxhYmVsOiAnRGlldGFyeSBSZXN0cmljdGlvbnMnIH0sXHJcbiAgcHJpb3JpdHlMZXZlbDogeyB2aXNpYmxlOiBmYWxzZSwgbWFuZGF0b3J5OiBmYWxzZSwgbGFiZWw6ICdQcmlvcml0eSBMZXZlbCcgfSxcclxuICBwYWNrYWdpbmc6IHsgdmlzaWJsZTogZmFsc2UsIG1hbmRhdG9yeTogZmFsc2UsIGxhYmVsOiAnUGFja2FnaW5nIERldGFpbHMnIH0sXHJcbn1cclxuXHJcbi8qKlxyXG4gKiBHZXQgZmllbGQgcHJlZmVyZW5jZXMgZm9yIHRoZSB1c2VyXHJcbiAqIFJldHVybnMgZGVmYXVsdCBwcmVmZXJlbmNlcyBpZiBub3Qgc2V0XHJcbiAqL1xyXG5leHBvcnQgY29uc3QgZ2V0RmllbGRQcmVmZXJlbmNlcyA9IGFzeW5jICgpID0+IHtcclxuICB0cnkge1xyXG4gICAgY29uc3QgcHJlZnMgPSBhd2FpdCBnZXRTZXR0aW5nKCdmaWVsZFByZWZlcmVuY2VzJylcclxuICAgIGlmICghcHJlZnMpIHtcclxuICAgICAgcmV0dXJuIERFRkFVTFRfRklFTERfUFJFRkVSRU5DRVNcclxuICAgIH1cclxuICAgIC8vIE1lcmdlIHdpdGggZGVmYXVsdHMgdG8gZW5zdXJlIG5ldyBmaWVsZHMgYXJlIGluY2x1ZGVkXHJcbiAgICByZXR1cm4geyAuLi5ERUZBVUxUX0ZJRUxEX1BSRUZFUkVOQ0VTLCAuLi5wcmVmcyB9XHJcbiAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byBnZXQgZmllbGQgcHJlZmVyZW5jZXM6JywgZXJyb3IpXHJcbiAgICByZXR1cm4gREVGQVVMVF9GSUVMRF9QUkVGRVJFTkNFU1xyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIFNldCBmaWVsZCBwcmVmZXJlbmNlc1xyXG4gKiBAcGFyYW0ge09iamVjdH0gcHJlZmVyZW5jZXMgLSBGaWVsZCBwcmVmZXJlbmNlcyBvYmplY3RcclxuICovXHJcbmV4cG9ydCBjb25zdCBzZXRGaWVsZFByZWZlcmVuY2VzID0gYXN5bmMgKHByZWZlcmVuY2VzKSA9PiB7XHJcbiAgdHJ5IHtcclxuICAgIGNvbnN0IG1lcmdlZCA9IHsgLi4uREVGQVVMVF9GSUVMRF9QUkVGRVJFTkNFUywgLi4ucHJlZmVyZW5jZXMgfVxyXG4gICAgYXdhaXQgc2V0U2V0dGluZygnZmllbGRQcmVmZXJlbmNlcycsIG1lcmdlZClcclxuICAgIHJldHVybiBtZXJnZWRcclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIHNldCBmaWVsZCBwcmVmZXJlbmNlczonLCBlcnJvcilcclxuICAgIHRocm93IG5ldyBFcnJvcihgRmFpbGVkIHRvIHNhdmUgZmllbGQgcHJlZmVyZW5jZXM6ICR7ZXJyb3IubWVzc2FnZX1gKVxyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIFJlc2V0IGZpZWxkIHByZWZlcmVuY2VzIHRvIGRlZmF1bHRzXHJcbiAqL1xyXG5leHBvcnQgY29uc3QgcmVzZXRGaWVsZFByZWZlcmVuY2VzID0gYXN5bmMgKCkgPT4ge1xyXG4gIHRyeSB7XHJcbiAgICBhd2FpdCBzZXRTZXR0aW5nKCdmaWVsZFByZWZlcmVuY2VzJywgREVGQVVMVF9GSUVMRF9QUkVGRVJFTkNFUylcclxuICAgIHJldHVybiBERUZBVUxUX0ZJRUxEX1BSRUZFUkVOQ0VTXHJcbiAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byByZXNldCBmaWVsZCBwcmVmZXJlbmNlczonLCBlcnJvcilcclxuICAgIHRocm93IG5ldyBFcnJvcihgRmFpbGVkIHRvIHJlc2V0IGZpZWxkIHByZWZlcmVuY2VzOiAke2Vycm9yLm1lc3NhZ2V9YClcclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBHZXQgdmlzaWJsZSBhbmQgbWFuZGF0b3J5IGZpZWxkc1xyXG4gKiBAcmV0dXJucyB7T2JqZWN0fSBPYmplY3Qgd2l0aCB2aXNpYmxlRmllbGRzIGFuZCBtYW5kYXRvcnlGaWVsZHMgYXJyYXlzXHJcbiAqL1xyXG5leHBvcnQgY29uc3QgZ2V0QWN0aXZlRmllbGRDb25maWcgPSBhc3luYyAoKSA9PiB7XHJcbiAgY29uc3QgcHJlZnMgPSBhd2FpdCBnZXRGaWVsZFByZWZlcmVuY2VzKClcclxuICBjb25zdCB2aXNpYmxlRmllbGRzID0gT2JqZWN0LmtleXMocHJlZnMpLmZpbHRlcigoa2V5KSA9PiBwcmVmc1trZXldLnZpc2libGUpXHJcbiAgY29uc3QgbWFuZGF0b3J5RmllbGRzID0gT2JqZWN0LmtleXMocHJlZnMpLmZpbHRlcigoa2V5KSA9PiBwcmVmc1trZXldLm1hbmRhdG9yeSlcclxuICByZXR1cm4geyB2aXNpYmxlRmllbGRzLCBtYW5kYXRvcnlGaWVsZHMsIHByZWZlcmVuY2VzOiBwcmVmcyB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBHZXQgaG91c2Vob2xkIHNpemVcclxuICogQHJldHVybnMge09iamVjdH0gSG91c2Vob2xkIHNpemUge2FkdWx0cywgY2hpbGRyZW59XHJcbiAqL1xyXG5leHBvcnQgY29uc3QgZ2V0SG91c2Vob2xkU2l6ZSA9IGFzeW5jICgpID0+IHtcclxuICB0cnkge1xyXG4gICAgY29uc3Qgc2l6ZSA9IGF3YWl0IGdldFNldHRpbmcoJ2hvdXNlaG9sZFNpemUnKVxyXG4gICAgcmV0dXJuIHNpemUgfHwgeyBhZHVsdHM6IDEsIGNoaWxkcmVuOiAwIH1cclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIGdldCBob3VzZWhvbGQgc2l6ZTonLCBlcnJvcilcclxuICAgIHJldHVybiB7IGFkdWx0czogMSwgY2hpbGRyZW46IDAgfVxyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIFNldCBob3VzZWhvbGQgc2l6ZVxyXG4gKiBAcGFyYW0ge251bWJlcn0gYWR1bHRzIC0gTnVtYmVyIG9mIGFkdWx0c1xyXG4gKiBAcGFyYW0ge251bWJlcn0gY2hpbGRyZW4gLSBOdW1iZXIgb2YgY2hpbGRyZW5cclxuICovXHJcbmV4cG9ydCBjb25zdCBzZXRIb3VzZWhvbGRTaXplID0gYXN5bmMgKGFkdWx0cywgY2hpbGRyZW4pID0+IHtcclxuICB0cnkge1xyXG4gICAgYXdhaXQgc2V0U2V0dGluZygnaG91c2Vob2xkU2l6ZScsIHsgYWR1bHRzLCBjaGlsZHJlbiB9KVxyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gc2V0IGhvdXNlaG9sZCBzaXplOicsIGVycm9yKVxyXG4gICAgdGhyb3cgZXJyb3JcclxuICB9XHJcbn1cclxuXHJcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuLy8gUkVBRElORVNTIENBTENVTEFUSU9OXHJcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuXHJcbi8qKlxyXG4gKiBDYWxjdWxhdGUgZW1lcmdlbmN5IHJlYWRpbmVzcyBiYXNlZCBvbiBEU0IgcmVjb21tZW5kYXRpb25zXHJcbiAqIEByZXR1cm5zIHtPYmplY3R9IFJlYWRpbmVzcyBkYXRhIHtwZXJjZW50YWdlLCB0b3RhbFJlcXVpcmVkLCB0b3RhbE1ldCwgbWlzc2luZ31cclxuICogXHJcbiAqIE5PVEU6IE1WUCB2MiBzaW1wbGlmaWVkIHZlcnNpb24gLSBiYXNpYyByZWFkaW5lc3MgY2FsY3VsYXRpb25cclxuICogRnVsbCBEU0ItYmFzZWQgaW1wbGVtZW50YXRpb24gYXZhaWxhYmxlIGluIGZ1dHVyZSB2ZXJzaW9uc1xyXG4gKi9cclxuZXhwb3J0IGNvbnN0IGNhbGN1bGF0ZVJlYWRpbmVzcyA9IGFzeW5jICgpID0+IHtcclxuICB0cnkge1xyXG4gICAgY29uc3QgaW52ZW50b3J5ID0gYXdhaXQgZ2V0SW52ZW50b3J5KClcclxuICAgIC8vIE1WUCB2MiBzaW1wbGlmaWVkOiBjYWxjdWxhdGUgcmVhZGluZXNzIGJhc2VkIG9uIGl0ZW0gY291bnQgYW5kIGV4cGlyeVxyXG4gICAgY29uc3QgdG90YWxJdGVtcyA9IGludmVudG9yeS5sZW5ndGhcclxuICAgIGNvbnN0IGV4cGlyaW5nSXRlbXMgPSBpbnZlbnRvcnkuZmlsdGVyKChpdGVtKSA9PiB7XHJcbiAgICAgIGlmICghaXRlbS5leHBpcnlEYXRlKSByZXR1cm4gZmFsc2VcclxuICAgICAgY29uc3QgZGF5cyA9IE1hdGguY2VpbCgobmV3IERhdGUoaXRlbS5leHBpcnlEYXRlKSAtIG5ldyBEYXRlKCkpIC8gKDEwMDAgKiA2MCAqIDYwICogMjQpKVxyXG4gICAgICByZXR1cm4gZGF5cyA8PSAzMCAmJiBkYXlzID4gMFxyXG4gICAgfSkubGVuZ3RoXHJcblxyXG4gICAgLy8gU2ltcGxlIHJlYWRpbmVzczogMTAwJSBpZiBoYXZlIGl0ZW1zLCBsb3dlciBpZiBleHBpcmluZyBzb29uXHJcbiAgICBjb25zdCB0b3RhbE1ldCA9IHRvdGFsSXRlbXMgLSBleHBpcmluZ0l0ZW1zXHJcbiAgICBjb25zdCBwZXJjZW50YWdlID0gdG90YWxJdGVtcyA+IDAgPyBNYXRoLnJvdW5kKCh0b3RhbE1ldCAvIHRvdGFsSXRlbXMpICogMTAwKSA6IDBcclxuXHJcbiAgICByZXR1cm4ge1xyXG4gICAgICBwZXJjZW50YWdlLFxyXG4gICAgICB0b3RhbFJlcXVpcmVkOiB0b3RhbEl0ZW1zLFxyXG4gICAgICB0b3RhbE1ldCxcclxuICAgICAgbWlzc2luZzogZXhwaXJpbmdJdGVtcyxcclxuICAgIH1cclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIGNhbGN1bGF0ZSByZWFkaW5lc3M6JywgZXJyb3IpXHJcbiAgICByZXR1cm4ge1xyXG4gICAgICBwZXJjZW50YWdlOiAwLFxyXG4gICAgICB0b3RhbFJlcXVpcmVkOiAwLFxyXG4gICAgICB0b3RhbE1ldDogMCxcclxuICAgICAgbWlzc2luZzogMCxcclxuICAgIH1cclxuICB9XHJcbn1cclxuXHJcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuLy8gTkhPU1QgU1lOQyAtIEZ1bmN0aW9ucyBleHBvcnRlZCBhYm92ZSBhcyBuYW1lZCBleHBvcnRzXHJcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuXHJcbi8qKlxyXG4gKiBBZGQgZW50cnkgdG8gc3luYyBsb2cgZm9yIG9mZmxpbmUgY2hhbmdlc1xyXG4gKiBAcGFyYW0ge3N0cmluZ30gb3BlcmF0aW9uIC0gJ2NyZWF0ZScsICd1cGRhdGUnLCAnZGVsZXRlJ1xyXG4gKiBAcGFyYW0ge3N0cmluZ30gdGFibGVOYW1lIC0gJ2ludmVudG9yeScgb3Igb3RoZXIgdGFibGVcclxuICogQHBhcmFtIHtudW1iZXJ9IHJlY29yZElkIC0gSUQgb2YgdGhlIHJlY29yZFxyXG4gKiBAcGFyYW0ge09iamVjdH0gY2hhbmdlcyAtIFRoZSBkYXRhIGJlaW5nIHN5bmNlZFxyXG4gKi9cclxuZXhwb3J0IGNvbnN0IGFkZFN5bmNMb2cgPSBhc3luYyAob3BlcmF0aW9uLCB0YWJsZU5hbWUsIHJlY29yZElkLCBjaGFuZ2VzKSA9PiB7XHJcbiAgdHJ5IHtcclxuICAgIGNvbnN0IGRiID0gYXdhaXQgaW5pdERCKClcclxuICAgIGNvbnN0IHR4ID0gZGIudHJhbnNhY3Rpb24oJ3N5bmNfbG9nJywgJ3JlYWR3cml0ZScpXHJcblxyXG4gICAgY29uc3Qgc3luY0VudHJ5ID0ge1xyXG4gICAgICBvcGVyYXRpb24sXHJcbiAgICAgIHRhYmxlTmFtZSxcclxuICAgICAgcmVjb3JkSWQsXHJcbiAgICAgIGNoYW5nZXMsXHJcbiAgICAgIHN0YXR1czogJ3BlbmRpbmcnLFxyXG4gICAgICBjcmVhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgc3luY2VkQXQ6IG51bGwsXHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgaWQgPSBhd2FpdCB0eC5zdG9yZS5hZGQoc3luY0VudHJ5KVxyXG4gICAgYXdhaXQgdHguZG9uZVxyXG5cclxuICAgIGNvbnNvbGUubG9nKGBbU1lOQyBMT0ddIEFkZGVkICR7b3BlcmF0aW9ufSBmb3IgJHt0YWJsZU5hbWV9OiR7cmVjb3JkSWR9YClcclxuICAgIHJldHVybiBpZFxyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gYWRkIHN5bmMgbG9nOicsIGVycm9yKVxyXG4gICAgdGhyb3cgZXJyb3JcclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBHZXQgc3luYyBsb2cgZW50cmllc1xyXG4gKiBAcGFyYW0ge3N0cmluZ30gc3RhdHVzIC0gRmlsdGVyIGJ5IHN0YXR1cyAoJ3BlbmRpbmcnLCAnc3luY2VkJywgJ2ZhaWxlZCcpXHJcbiAqIEByZXR1cm5zIHtBcnJheX0gU3luYyBsb2cgZW50cmllc1xyXG4gKi9cclxuZXhwb3J0IGNvbnN0IGdldFN5bmNMb2cgPSBhc3luYyAoc3RhdHVzID0gbnVsbCkgPT4ge1xyXG4gIHRyeSB7XHJcbiAgICBjb25zdCBkYiA9IGF3YWl0IGluaXREQigpXHJcbiAgICBjb25zdCBsb2dzID0gYXdhaXQgZGIuZ2V0QWxsKCdzeW5jX2xvZycpXHJcblxyXG4gICAgaWYgKHN0YXR1cykge1xyXG4gICAgICByZXR1cm4gbG9ncy5maWx0ZXIoKGxvZykgPT4gbG9nLnN0YXR1cyA9PT0gc3RhdHVzKVxyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBsb2dzXHJcbiAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byBnZXQgc3luYyBsb2c6JywgZXJyb3IpXHJcbiAgICByZXR1cm4gW11cclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBHZXQgcGVuZGluZyBzeW5jc1xyXG4gKiBAcmV0dXJucyB7QXJyYXl9IFBlbmRpbmcgc3luYyBlbnRyaWVzXHJcbiAqL1xyXG5leHBvcnQgY29uc3QgZ2V0UGVuZGluZ1N5bmNzID0gYXN5bmMgKCkgPT4ge1xyXG4gIHJldHVybiBnZXRTeW5jTG9nKCdwZW5kaW5nJylcclxufVxyXG5cclxuLyoqXHJcbiAqIE1hcmsgc3luYyBlbnRyeSBhcyBzdWNjZXNzZnVsXHJcbiAqIEBwYXJhbSB7bnVtYmVyfSBzeW5jSWQgLSBJRCBvZiBzeW5jIGxvZyBlbnRyeVxyXG4gKi9cclxuZXhwb3J0IGNvbnN0IG1hcmtTeW5jU3VjY2VzcyA9IGFzeW5jIChzeW5jSWQpID0+IHtcclxuICB0cnkge1xyXG4gICAgY29uc3QgZGIgPSBhd2FpdCBpbml0REIoKVxyXG4gICAgY29uc3QgdHggPSBkYi50cmFuc2FjdGlvbignc3luY19sb2cnLCAncmVhZHdyaXRlJylcclxuXHJcbiAgICBjb25zdCBlbnRyeSA9IGF3YWl0IHR4LnN0b3JlLmdldChzeW5jSWQpXHJcbiAgICBpZiAoZW50cnkpIHtcclxuICAgICAgZW50cnkuc3RhdHVzID0gJ3N5bmNlZCdcclxuICAgICAgZW50cnkuc3luY2VkQXQgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKClcclxuICAgICAgYXdhaXQgdHguc3RvcmUucHV0KGVudHJ5KVxyXG4gICAgfVxyXG5cclxuICAgIGF3YWl0IHR4LmRvbmVcclxuICAgIGNvbnNvbGUubG9nKGBbU1lOQ10gTWFya2VkIHN5bmMgJHtzeW5jSWR9IGFzIHN1Y2Nlc3NmdWxgKVxyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gbWFyayBzeW5jIHN1Y2Nlc3M6JywgZXJyb3IpXHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogTWFyayBzeW5jIGVudHJ5IGFzIGZhaWxlZFxyXG4gKiBAcGFyYW0ge251bWJlcn0gc3luY0lkIC0gSUQgb2Ygc3luYyBsb2cgZW50cnlcclxuICogQHBhcmFtIHtzdHJpbmd9IGVycm9yTWVzc2FnZSAtIEVycm9yIGRlc2NyaXB0aW9uXHJcbiAqL1xyXG5leHBvcnQgY29uc3QgbWFya1N5bmNGYWlsZWQgPSBhc3luYyAoc3luY0lkLCBlcnJvck1lc3NhZ2UpID0+IHtcclxuICB0cnkge1xyXG4gICAgY29uc3QgZGIgPSBhd2FpdCBpbml0REIoKVxyXG4gICAgY29uc3QgdHggPSBkYi50cmFuc2FjdGlvbignc3luY19sb2cnLCAncmVhZHdyaXRlJylcclxuXHJcbiAgICBjb25zdCBlbnRyeSA9IGF3YWl0IHR4LnN0b3JlLmdldChzeW5jSWQpXHJcbiAgICBpZiAoZW50cnkpIHtcclxuICAgICAgZW50cnkuc3RhdHVzID0gJ2ZhaWxlZCdcclxuICAgICAgZW50cnkuZXJyb3JNZXNzYWdlID0gZXJyb3JNZXNzYWdlXHJcbiAgICAgIGF3YWl0IHR4LnN0b3JlLnB1dChlbnRyeSlcclxuICAgIH1cclxuXHJcbiAgICBhd2FpdCB0eC5kb25lXHJcbiAgICBjb25zb2xlLmxvZyhgW1NZTkNdIE1hcmtlZCBzeW5jICR7c3luY0lkfSBhcyBmYWlsZWQ6ICR7ZXJyb3JNZXNzYWdlfWApXHJcbiAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byBtYXJrIHN5bmMgZmFpbGVkOicsIGVycm9yKVxyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIENsZWFyIGFsbCBzeW5jZWQgZW50cmllcyBmcm9tIHN5bmMgbG9nXHJcbiAqL1xyXG5leHBvcnQgY29uc3QgY2xlYXJTeW5jTG9nID0gYXN5bmMgKCkgPT4ge1xyXG4gIHRyeSB7XHJcbiAgICBjb25zdCBkYiA9IGF3YWl0IGluaXREQigpXHJcbiAgICBjb25zdCB0eCA9IGRiLnRyYW5zYWN0aW9uKCdzeW5jX2xvZycsICdyZWFkd3JpdGUnKVxyXG5cclxuICAgIGNvbnN0IGxvZ3MgPSBhd2FpdCB0eC5zdG9yZS5nZXRBbGwoKVxyXG4gICAgZm9yIChjb25zdCBsb2cgb2YgbG9ncykge1xyXG4gICAgICBpZiAobG9nLnN0YXR1cyA9PT0gJ3N5bmNlZCcpIHtcclxuICAgICAgICBhd2FpdCB0eC5zdG9yZS5kZWxldGUobG9nLmNyZWF0ZWRBdClcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGF3YWl0IHR4LmRvbmVcclxuICAgIGNvbnNvbGUubG9nKCdbU1lOQ10gQ2xlYXJlZCBzeW5jZWQgZW50cmllcyBmcm9tIHN5bmMgbG9nJylcclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIGNsZWFyIHN5bmMgbG9nOicsIGVycm9yKVxyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIENvbnZlcnQgbG9jYWwgZGF0YSBmb3JtYXQgdG8gTmhvc3QgZm9ybWF0XHJcbiAqIEBwYXJhbSB7T2JqZWN0fSBpdGVtIC0gTG9jYWwgaW52ZW50b3J5IGl0ZW1cclxuICogQHJldHVybnMge09iamVjdH0gTmhvc3QtZm9ybWF0dGVkIGl0ZW1cclxuICovXHJcbmZ1bmN0aW9uIGNvbnZlcnRUb05ob3N0Rm9ybWF0KGl0ZW0pIHtcclxuICBjb25zdCBuaG9zdEl0ZW0gPSB7XHJcbiAgICBiYXJjb2RlOiBpdGVtLmJhcmNvZGUgfHwgbnVsbCxcclxuICAgIHByb2R1Y3RfbmFtZTogaXRlbS5wcm9kdWN0TmFtZSxcclxuICAgIHF1YW50aXR5OiBpdGVtLnF1YW50aXR5LFxyXG4gICAgdW5pdDogaXRlbS51bml0LFxyXG4gICAgZXhwaXJ5X2RhdGU6IGl0ZW0uZXhwaXJ5RGF0ZSxcclxuICAgIHB1cmNoYXNlX2RhdGU6IGl0ZW0ucHVyY2hhc2VEYXRlIHx8IG51bGwsXHJcbiAgICBwcmVmZXJyZWRfY29uc3VtcHRpb25fZGF0ZTogaXRlbS5wcmVmZXJyZWRDb25zdW1wdGlvbkRhdGUgfHwgbnVsbCxcclxuICAgIHN0b3JhZ2VfbG9jYXRpb246IGl0ZW0uc3RvcmFnZUxvY2F0aW9uIHx8IG51bGwsXHJcbiAgICBpdGVtX3N0YXR1czogaXRlbS5pdGVtU3RhdHVzIHx8ICd1bm9wZW5lZCcsXHJcbiAgICBzdG9yYWdlX25vdGVzOiBpdGVtLnN0b3JhZ2VOb3RlcyB8fCBudWxsLFxyXG4gICAgYWxsZXJnZW5zOiBpdGVtLmFsbGVyZ2VucyB8fCBudWxsLFxyXG4gICAgZGlldGFyeV9yZXN0cmljdGlvbnM6IGl0ZW0uZGlldGFyeVJlc3RyaWN0aW9ucyB8fCBbXSxcclxuICAgIGNvc3Q6IGl0ZW0uY29zdCA/IHBhcnNlRmxvYXQoaXRlbS5jb3N0KSA6IG51bGwsXHJcbiAgICBzdXBwbGllcjogaXRlbS5zdXBwbGllciB8fCBudWxsLFxyXG4gICAgbG90X251bWJlcjogaXRlbS5sb3ROdW1iZXIgfHwgbnVsbCxcclxuICAgIG51dHJpdGlvbl9pbmZvOiBpdGVtLm51dHJpdGlvbkluZm8gfHwgbnVsbCxcclxuICAgIHByaW9yaXR5X2xldmVsOiBpdGVtLnByaW9yaXR5TGV2ZWwgfHwgJ2ltcG9ydGFudCcsXHJcbiAgICBwYWNrYWdpbmc6IGl0ZW0ucGFja2FnaW5nIHx8IG51bGwsXHJcbiAgfVxyXG5cclxuICByZXR1cm4gbmhvc3RJdGVtXHJcbn1cclxuXHJcbi8qKlxyXG4gKiBTeW5jIG9mZmxpbmUgaW52ZW50b3J5IGl0ZW1zIHRvIE5ob3N0XHJcbiAqIEBwYXJhbSB7T2JqZWN0fSBuaG9zdENsaWVudCAtIE5ob3N0IGNsaWVudCBpbnN0YW5jZVxyXG4gKiBAcmV0dXJucyB7T2JqZWN0fSBTeW5jIHJlc3VsdHNcclxuICovXHJcbmV4cG9ydCBjb25zdCBzeW5jVG9OaG9zdCA9IGFzeW5jIChuaG9zdENsaWVudCkgPT4ge1xyXG4gIGlmICghbmhvc3RDbGllbnQgfHwgIW5ob3N0Q2xpZW50LmdyYXBocWwucmVxdWVzdCkge1xyXG4gICAgY29uc29sZS53YXJuKCdbU1lOQ10gTmhvc3QgY2xpZW50IG5vdCBhdmFpbGFibGUsIHNraXBwaW5nIHN5bmMnKVxyXG4gICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIHN5bmNlZDogMCwgZmFpbGVkOiAwLCBtZXNzYWdlOiAnTmhvc3Qgbm90IGNvbmZpZ3VyZWQnIH1cclxuICB9XHJcblxyXG4gIHRyeSB7XHJcbiAgICBjb25zdCBwZW5kaW5nU3luY3MgPSBhd2FpdCBnZXRQZW5kaW5nU3luY3MoKVxyXG5cclxuICAgIGlmIChwZW5kaW5nU3luY3MubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgIGNvbnNvbGUubG9nKCdbU1lOQ10gTm8gcGVuZGluZyBzeW5jcycpXHJcbiAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIHN5bmNlZDogMCwgZmFpbGVkOiAwLCBtZXNzYWdlOiAnTm8gcGVuZGluZyBpdGVtcycgfVxyXG4gICAgfVxyXG5cclxuICAgIGNvbnNvbGUubG9nKGBbU1lOQ10gU3RhcnRpbmcgc3luYyBvZiAke3BlbmRpbmdTeW5jcy5sZW5ndGh9IGl0ZW1zYClcclxuXHJcbiAgICBsZXQgc3luY2VkID0gMFxyXG4gICAgbGV0IGZhaWxlZCA9IDBcclxuXHJcbiAgICBmb3IgKGNvbnN0IHN5bmNFbnRyeSBvZiBwZW5kaW5nU3luY3MpIHtcclxuICAgICAgdHJ5IHtcclxuICAgICAgICBjb25zdCB7IG9wZXJhdGlvbiwgdGFibGVOYW1lLCByZWNvcmRJZCwgY2hhbmdlcyB9ID0gc3luY0VudHJ5XHJcblxyXG4gICAgICAgIGlmICh0YWJsZU5hbWUgIT09ICdpbnZlbnRvcnknKSB7XHJcbiAgICAgICAgICBhd2FpdCBtYXJrU3luY1N1Y2Nlc3Moc3luY0VudHJ5LmNyZWF0ZWRBdClcclxuICAgICAgICAgIHN5bmNlZCsrXHJcbiAgICAgICAgICBjb250aW51ZVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gQnVpbGQgR3JhcGhRTCBtdXRhdGlvbiBmb3IgaW52ZW50b3J5XHJcbiAgICAgICAgbGV0IG11dGF0aW9uXHJcbiAgICAgICAgbGV0IHZhcmlhYmxlcyA9IHsgZGF0YTogY29udmVydFRvTmhvc3RGb3JtYXQoY2hhbmdlcykgfVxyXG5cclxuICAgICAgICBpZiAob3BlcmF0aW9uID09PSAnY3JlYXRlJykge1xyXG4gICAgICAgICAgbXV0YXRpb24gPSBgXHJcbiAgICAgICAgICAgIG11dGF0aW9uIENyZWF0ZUludmVudG9yeUl0ZW0oJGRhdGE6IGludmVudG9yeV9pbnNlcnRfaW5wdXQhKSB7XHJcbiAgICAgICAgICAgICAgaW5zZXJ0X2ludmVudG9yeV9vbmUob2JqZWN0OiAkZGF0YSkge1xyXG4gICAgICAgICAgICAgICAgaWRcclxuICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgIGBcclxuICAgICAgICB9IGVsc2UgaWYgKG9wZXJhdGlvbiA9PT0gJ3VwZGF0ZScpIHtcclxuICAgICAgICAgIG11dGF0aW9uID0gYFxyXG4gICAgICAgICAgICBtdXRhdGlvbiBVcGRhdGVJbnZlbnRvcnlJdGVtKCRpZDogdXVpZCEsICRkYXRhOiBpbnZlbnRvcnlfc2V0X2lucHV0ISkge1xyXG4gICAgICAgICAgICAgIHVwZGF0ZV9pbnZlbnRvcnlfYnlfcGsocGtfY29sdW1uczogeyBpZDogJGlkIH0sIF9zZXQ6ICRkYXRhKSB7XHJcbiAgICAgICAgICAgICAgICBpZFxyXG4gICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgYFxyXG4gICAgICAgICAgdmFyaWFibGVzLmlkID0gcmVjb3JkSWRcclxuICAgICAgICB9IGVsc2UgaWYgKG9wZXJhdGlvbiA9PT0gJ2RlbGV0ZScpIHtcclxuICAgICAgICAgIG11dGF0aW9uID0gYFxyXG4gICAgICAgICAgICBtdXRhdGlvbiBEZWxldGVJbnZlbnRvcnlJdGVtKCRpZDogdXVpZCEpIHtcclxuICAgICAgICAgICAgICBkZWxldGVfaW52ZW50b3J5X2J5X3BrKGlkOiAkaWQpIHtcclxuICAgICAgICAgICAgICAgIGlkXHJcbiAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICBgXHJcbiAgICAgICAgICB2YXJpYWJsZXMuaWQgPSByZWNvcmRJZFxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKCFtdXRhdGlvbikge1xyXG4gICAgICAgICAgYXdhaXQgbWFya1N5bmNGYWlsZWQoc3luY0VudHJ5LmNyZWF0ZWRBdCwgJ1Vua25vd24gb3BlcmF0aW9uJylcclxuICAgICAgICAgIGZhaWxlZCsrXHJcbiAgICAgICAgICBjb250aW51ZVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gRXhlY3V0ZSBtdXRhdGlvblxyXG4gICAgICAgIGF3YWl0IG5ob3N0Q2xpZW50LmdyYXBocWwucmVxdWVzdCh7XHJcbiAgICAgICAgICBxdWVyeTogbXV0YXRpb24sXHJcbiAgICAgICAgICB2YXJpYWJsZXMsXHJcbiAgICAgICAgfSlcclxuXHJcbiAgICAgICAgYXdhaXQgbWFya1N5bmNTdWNjZXNzKHN5bmNFbnRyeS5jcmVhdGVkQXQpXHJcbiAgICAgICAgc3luY2VkKytcclxuICAgICAgfSBjYXRjaCAoaXRlbUVycm9yKSB7XHJcbiAgICAgICAgY29uc29sZS5lcnJvcihgW1NZTkNdIEZhaWxlZCB0byBzeW5jIGl0ZW06YCwgaXRlbUVycm9yKVxyXG4gICAgICAgIGF3YWl0IG1hcmtTeW5jRmFpbGVkKHN5bmNFbnRyeS5jcmVhdGVkQXQsIGl0ZW1FcnJvci5tZXNzYWdlKVxyXG4gICAgICAgIGZhaWxlZCsrXHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBjb25zb2xlLmxvZyhgW1NZTkNdIENvbXBsZXRlZDogJHtzeW5jZWR9IHN5bmNlZCwgJHtmYWlsZWR9IGZhaWxlZGApXHJcblxyXG4gICAgcmV0dXJuIHtcclxuICAgICAgc3VjY2VzczogZmFpbGVkID09PSAwLFxyXG4gICAgICBzeW5jZWQsXHJcbiAgICAgIGZhaWxlZCxcclxuICAgICAgbWVzc2FnZTogYFN5bmNlZCAke3N5bmNlZH0gaXRlbXMke2ZhaWxlZCA+IDAgPyBgLCAke2ZhaWxlZH0gZmFpbGVkYCA6ICcnfWAsXHJcbiAgICB9XHJcbiAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgIGNvbnNvbGUuZXJyb3IoJ1tTWU5DXSBTeW5jIGZhaWxlZDonLCBlcnJvcilcclxuICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBzeW5jZWQ6IDAsIGZhaWxlZDogMCwgbWVzc2FnZTogZXJyb3IubWVzc2FnZSB9XHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogRmV0Y2ggY2hhbmdlcyBmcm9tIGNsb3VkIGFuZCBhcHBseSB0byBsb2NhbCBEQiBmb3IgYSBob3VzZWhvbGRcclxuICogLSBVc2VzIHNlcnZlciBgdXBkYXRlZF9hdGAgYXMgYXV0aG9yaXRhdGl2ZSB0aW1lc3RhbXBcclxuICovXHJcbmV4cG9ydCBjb25zdCBmZXRjaEZyb21DbG91ZCA9IGFzeW5jIChob3VzZWhvbGRJZCkgPT4ge1xyXG4gIHRyeSB7XHJcbiAgICBpZiAoIWhvdXNlaG9sZElkKSB0aHJvdyBuZXcgRXJyb3IoJ2hvdXNlaG9sZElkIHJlcXVpcmVkJylcclxuICAgIGlmICghaXNOaG9zdENvbmZpZ3VyZWQoKSB8fCAhaXNOaG9zdEF1dGhlbnRpY2F0ZWQoKSkge1xyXG4gICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgcmVhc29uOiAnTm90IGNvbmZpZ3VyZWQgb3Igbm90IGF1dGhlbnRpY2F0ZWQnIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyBMYXN0IHN5bmMgcGVyLWhvdXNlaG9sZFxyXG4gICAgY29uc3QgbGFzdFN5bmNLZXkgPSBgbGFzdFN5bmM6JHtob3VzZWhvbGRJZH1gXHJcbiAgICBjb25zdCBsYXN0U3luYyA9IChhd2FpdCBnZXRTZXR0aW5nKGxhc3RTeW5jS2V5KSkgfHwgbmV3IERhdGUoMCkudG9JU09TdHJpbmcoKVxyXG5cclxuICAgIGNvbnN0IGNoYW5nZXMgPSBhd2FpdCBnZXRJbnZlbnRvcnlDaGFuZ2VzU2luY2UobGFzdFN5bmMsIGhvdXNlaG9sZElkKVxyXG4gICAgaWYgKCFjaGFuZ2VzIHx8IGNoYW5nZXMubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgIGF3YWl0IHNldFNldHRpbmcobGFzdFN5bmNLZXksIG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSlcclxuICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgYXBwbGllZDogMCB9XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgZGIgPSBhd2FpdCBpbml0REIoKVxyXG4gICAgY29uc3QgdHggPSBkYi50cmFuc2FjdGlvbignaW52ZW50b3J5JywgJ3JlYWR3cml0ZScpXHJcbiAgICBsZXQgYXBwbGllZCA9IDBcclxuXHJcbiAgICBmb3IgKGNvbnN0IHJvdyBvZiBjaGFuZ2VzKSB7XHJcbiAgICAgIGNvbnN0IGV4aXN0aW5nID0gYXdhaXQgdHguc3RvcmUuZ2V0KHJvdy5pZClcclxuXHJcbiAgICAgIGlmIChyb3cuX2RlbGV0ZWQpIHtcclxuICAgICAgICBpZiAoZXhpc3RpbmcpIHtcclxuICAgICAgICAgIGV4aXN0aW5nLl9kZWxldGVkID0gdHJ1ZVxyXG4gICAgICAgICAgZXhpc3Rpbmcuc3luY2VkQXQgPSByb3cudXBkYXRlZF9hdCB8fCBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKClcclxuICAgICAgICAgIGF3YWl0IHR4LnN0b3JlLnB1dChleGlzdGluZylcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgLy8gY3JlYXRlIHRvbWJzdG9uZVxyXG4gICAgICAgICAgYXdhaXQgdHguc3RvcmUucHV0KHtcclxuICAgICAgICAgICAgaWQ6IHJvdy5pZCxcclxuICAgICAgICAgICAgaG91c2Vob2xkX2lkOiByb3cuaG91c2Vob2xkX2lkLFxyXG4gICAgICAgICAgICBfZGVsZXRlZDogdHJ1ZSxcclxuICAgICAgICAgICAgc3luY2VkQXQ6IHJvdy51cGRhdGVkX2F0IHx8IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgICAgIH0pXHJcbiAgICAgICAgfVxyXG4gICAgICAgIGFwcGxpZWQrK1xyXG4gICAgICAgIGNvbnRpbnVlXHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGNvbnN0IHRvUHV0ID0ge1xyXG4gICAgICAgIGlkOiByb3cuaWQsXHJcbiAgICAgICAgaG91c2Vob2xkX2lkOiByb3cuaG91c2Vob2xkX2lkLFxyXG4gICAgICAgIHByb2R1Y3RJZDogcm93LnByb2R1Y3RfaWQgfHwgbnVsbCxcclxuICAgICAgICBxdWFudGl0eTogcm93LnF1YW50aXR5IHx8IG51bGwsXHJcbiAgICAgICAgZXhwaXJ5RGF0ZTogcm93LmV4cGlyeV9kYXRlIHx8IG51bGwsXHJcbiAgICAgICAgYWRkZWRBdDogcm93LmFkZGVkX2F0IHx8IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgICBsYXN0Q2hlY2tlZEF0OiByb3cudXBkYXRlZF9hdCB8fCBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgICAgbm90aWZpY2F0aW9uU2VudDogZmFsc2UsXHJcbiAgICAgICAgc3luY2VkQXQ6IHJvdy51cGRhdGVkX2F0IHx8IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgICBfZGVsZXRlZDogISFyb3cuX2RlbGV0ZWQsXHJcbiAgICAgICAgYWxsb3dHcmFjZVBlcmlvZDogISFyb3cuYWxsb3dHcmFjZVBlcmlvZCxcclxuICAgICAgICBncmFjZVBlcmlvZE1vbnRoczogcm93LmdyYWNlUGVyaW9kTW9udGhzIHx8IG51bGwsXHJcbiAgICAgICAgaW1hZ2VVcmw6IHJvdy5pbWFnZVVybCB8fCBudWxsLFxyXG4gICAgICB9XHJcblxyXG4gICAgICBhd2FpdCB0eC5zdG9yZS5wdXQoeyAuLi5leGlzdGluZywgLi4udG9QdXQgfSlcclxuICAgICAgYXBwbGllZCsrXHJcbiAgICB9XHJcblxyXG4gICAgYXdhaXQgdHguZG9uZVxyXG5cclxuICAgIC8vIFVwZGF0ZSBsYXN0U3luYyBtYXJrZXJcclxuICAgIGF3YWl0IHNldFNldHRpbmcobGFzdFN5bmNLZXksIG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSlcclxuXHJcbiAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBhcHBsaWVkIH1cclxuICB9IGNhdGNoIChlcnIpIHtcclxuICAgIGNvbnNvbGUuZXJyb3IoJ2ZldGNoRnJvbUNsb3VkIGZhaWxlZDonLCBlcnIpXHJcbiAgICB0aHJvdyBlcnJcclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBGb3JjZSB1cGRhdGUgaW52ZW50b3J5IGl0ZW0gd2l0aG91dCBwcmUtd3JpdGUgcmVtb3RlIGNoZWNrLlxyXG4gKiBVc2UgdGhpcyB3aGVuIHRoZSB1c2VyIGV4cGxpY2l0bHkgY2hvb3NlcyB0byBvdmVyd3JpdGUgcmVtb3RlIGRhdGEuXHJcbiAqL1xyXG5leHBvcnQgY29uc3QgdXBkYXRlSW52ZW50b3J5SXRlbUZvcmNlID0gYXN5bmMgKGlkLCB1cGRhdGVzKSA9PiB7XHJcbiAgdHJ5IHtcclxuICAgIGNvbnN0IGRiID0gYXdhaXQgaW5pdERCKClcclxuICAgIGNvbnN0IHR4ID0gZGIudHJhbnNhY3Rpb24oJ2ludmVudG9yeScsICdyZWFkd3JpdGUnKVxyXG4gICAgY29uc3QgaXRlbSA9IGF3YWl0IHR4LnN0b3JlLmdldChpZClcclxuXHJcbiAgICBpZiAoIWl0ZW0pIHtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKGBJbnZlbnRvcnkgaXRlbSB3aXRoIElEICR7aWR9IG5vdCBmb3VuZGApXHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgdXBkYXRlZEl0ZW0gPSB7XHJcbiAgICAgIC4uLml0ZW0sXHJcbiAgICAgIC4uLnVwZGF0ZXMsXHJcbiAgICAgIGxhc3RDaGVja2VkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgc3luY2VkQXQ6IG51bGwsIC8vIE1hcmsgYXMgbmVlZGluZyBzeW5jXHJcbiAgICB9XHJcblxyXG4gICAgYXdhaXQgdHguc3RvcmUucHV0KHVwZGF0ZWRJdGVtKVxyXG4gICAgYXdhaXQgdHguZG9uZVxyXG5cclxuICAgIC8vIFRyYWNrIGNoYW5nZSBmb3Igc3luY1xyXG4gICAgYXdhaXQgdHJhY2tDaGFuZ2UoJ2ludmVudG9yeScsIGlkLCAndXBkYXRlJylcclxuXHJcbiAgICAvLyBUcmlnZ2VyIGJhY2tncm91bmQgc3luYyAoYmVzdC1lZmZvcnQpXHJcbiAgICB0cnkge1xyXG4gICAgICBzeW5jVG9DbG91ZCgpLmNhdGNoKChlKSA9PiBjb25zb2xlLndhcm4oJ0JhY2tncm91bmQgc3luYyBmYWlsZWQ6JywgZS5tZXNzYWdlIHx8IGUpKVxyXG4gICAgfSBjYXRjaCAoZSkge1xyXG4gICAgICBjb25zb2xlLndhcm4oJ0ZhaWxlZCB0byB0cmlnZ2VyIGJhY2tncm91bmQgc3luYzonLCBlLm1lc3NhZ2UgfHwgZSlcclxuICAgIH1cclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIGZvcmNlIHVwZGF0ZSBpbnZlbnRvcnkgaXRlbTonLCBlcnJvcilcclxuICAgIHRocm93IG5ldyBFcnJvcihgRmFpbGVkIHRvIHVwZGF0ZSBpbnZlbnRvcnkgaXRlbTogJHtlcnJvci5tZXNzYWdlfWApXHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogR2V0IGEgc2luZ2xlIGludmVudG9yeSBpdGVtIGJ5IGlkIGZyb20gbG9jYWwgREJcclxuICovXHJcbmV4cG9ydCBjb25zdCBnZXRJbnZlbnRvcnlJdGVtID0gYXN5bmMgKGlkKSA9PiB7XHJcbiAgdHJ5IHtcclxuICAgIGNvbnN0IGRiID0gYXdhaXQgaW5pdERCKClcclxuICAgIGNvbnN0IGl0ZW0gPSBhd2FpdCBkYi5nZXQoJ2ludmVudG9yeScsIGlkKVxyXG4gICAgcmV0dXJuIGl0ZW0gfHwgbnVsbFxyXG4gIH0gY2F0Y2ggKGVycikge1xyXG4gICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIGdldCBpbnZlbnRvcnkgaXRlbTonLCBlcnIpXHJcbiAgICB0aHJvdyBlcnJcclxuICB9XHJcbn0iXSwidmVyc2lvbiI6M30=