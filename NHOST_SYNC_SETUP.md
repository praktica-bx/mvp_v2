# Nhost Cloud Sync Implementation

## Overview

The Emergency Supply Manager mvp_v2 now includes full Nhost cloud sync support with offline-first capabilities. Users can add items while offline, and they'll be automatically synced to Nhost when the connection is restored.

## Features

✅ **Offline-First Architecture**
- Add inventory items while offline
- All data stored locally in IndexedDB
- Automatic sync to cloud when online

✅ **Network Detection**
- Real-time online/offline status detection
- Visual warning when offline (red banner)
- Sync reminder when items are pending

✅ **Sync Tracking**
- Sync log table tracks all pending changes
- Status tracking: pending, synced, failed
- Error messages for failed syncs
- Automatic retry on reconnection

✅ **User Experience**
- Non-blocking offline mode
- Clear visual feedback
- No data loss if device crashes

## Setup Instructions

### 1. Create Nhost Project

1. Go to https://console.nhost.io
2. Create a new project
3. Copy your **Subdomain** and **Region**

### 2. Configure Environment Variables

Create a `.env.local` file in `mvp_v2/`:

```env
VITE_NHOST_SUBDOMAIN=your-nhost-subdomain
VITE_NHOST_REGION=us-east-1
```

### 3. Update Database Schema

1. Go to Nhost Console → SQL Editor
2. Run the schema from `sql/nhost-schema.sql`
3. This creates the `inventory`, `products`, `user_settings`, and `sync_log` tables

### 4. Configure Hasura Permissions

In Nhost Console → Hasura → Data:

**For `inventory` table:**
- SELECT: `user_id` = current user
- INSERT: `user_id` = current user
- UPDATE: `user_id` = current user
- DELETE: `user_id` = current user

**For `sync_log` table:**
- SELECT: `user_id` = current user
- INSERT: `user_id` = current user
- UPDATE: `user_id` = current user

### 5. Enable Authentication

In Nhost Console → Settings → Authentication:
- Enable Email/Password authentication
- Configure allowed domains

## How It Works

### Offline Flow

1. User is offline (detected via `navigator.onLine`)
2. User adds an inventory item
3. Item is saved to local IndexedDB
4. Entry added to `sync_log` table with status `pending`
5. Red warning banner shows "You are offline"

### Online Sync Flow

1. Device comes online (detected via `window.online` event)
2. App checks for pending syncs in `sync_log`
3. For each pending item:
   - Converts local format to Nhost format
   - Sends GraphQL mutation to create/update/delete
   - If successful: marks as `synced`, removes from UI log
   - If fails: marks as `failed`, retries on next online
4. Blue reminder banner shows "X items waiting to sync"
5. After sync completes, clears old synced entries

### Data Format Mapping

Local field → Nhost field:
- `productName` → `product_name`
- `expiryDate` → `expiry_date`
- `purchaseDate` → `purchase_date`
- `storageLocation` → `storage_location`
- `itemStatus` → `item_status`
- `storageNotes` → `storage_notes`
- `dietaryRestrictions` → `dietary_restrictions` (array)
- `lotNumber` → `lot_number`
- `nutritionInfo` → `nutrition_info`
- `priorityLevel` → `priority_level`

## Code Structure

### New Files

```
src/
├── nhost.js                      # Nhost SDK initialization
├── hooks/
│   └── useOnlineStatus.js        # Network detection hook
├── components/
│   ├── OfflineWarning.jsx        # Offline/sync warning UI
│   └── OfflineWarning.css        # Styling
```

### Modified Files

```
src/
├── database.js                   # Added sync functions
├── App.jsx                       # Added online detection & sync UI
├── components/InventoryForm.jsx  # Track offline saves
```

### Database Changes

```
database.js (IndexedDB):
├── inventory                     # All 19 metadata fields
├── sync_log                      # Track pending changes
└── settings                      # Field preferences
```

```
nhost-schema.sql (PostgreSQL):
├── inventory table              # Updated with all fields
├── products table               # Unchanged
├── user_settings table          # Unchanged
└── sync_log table              # NEW - tracks offline changes
```

## API Reference

### Database Functions

#### Sync Log Management

```javascript
// Add a pending sync
await addSyncLog('create', 'inventory', itemId, itemData)

// Get all pending syncs
const pending = await getPendingSyncs()

// Mark as synced
await markSyncSuccess(syncId)

// Mark as failed
await markSyncFailed(syncId, 'Error message')

// Sync to Nhost
const result = await syncToNhost(nhostClient)
// Returns: { success, synced, failed, message }
```

#### Online Status

```javascript
import useOnlineStatus from './hooks/useOnlineStatus'

const { isOnline, lastOnlineTime } = useOnlineStatus()
```

## Error Handling

### Connection Errors
- Automatically retried when device comes online
- Failed syncs marked with error message
- User can see failed items in sync log

### Validation Errors
- Field validation happens client-side first
- Server-side validation via Hasura permissions
- Failed syncs show error detail

### Conflict Resolution
- Last-write-wins: server timestamp takes priority
- No conflict merging (kept simple for MVP)
- Failed items remain in sync queue

## Testing

### Offline Testing

1. Open DevTools (F12)
2. Go to Network tab
3. Check "Offline" checkbox
4. Add inventory items
5. Items saved locally
6. Uncheck "Offline" to test sync

### Sync Log Testing

```javascript
// In browser console:
const pending = await getPendingSyncs()
console.log(pending) // See all pending syncs

const logs = await getSyncLog()
console.log(logs) // See all sync history
```

## Performance Notes

- IndexedDB stores unlimited local data (browser dependent)
- Sync batching: processes pending items sequentially
- No aggressive polling: sync only on online event
- GraphQL queries optimized with required fields

## Security

- Nhost handles all authentication
- User isolation via Hasura permissions
- Soft deletes preserve data integrity
- No sensitive data in localStorage

## Future Enhancements

- [ ] Bulk sync operations
- [ ] Conflict resolution UI
- [ ] Sync progress indicator
- [ ] Partial sync retry (failed items only)
- [ ] Encryption for sensitive fields
- [ ] Selective sync by category
- [ ] CloudKit/Firebase sync as alternative

## Troubleshooting

### Syncs Not Happening

1. Check browser console for errors
2. Verify Nhost credentials in `.env.local`
3. Check Nhost Console → Database → sync_log table
4. Verify user permissions in Hasura

### Data Not Appearing Online

1. Verify Nhost table schema is correct
2. Check user_id is set correctly
3. Review Hasura permissions
4. Check browser console for GraphQL errors

### Offline Not Detected

1. Check `window.onLine` in browser console
2. Use Network tab to simulate offline
3. Verify `useOnlineStatus` hook is imported

## References

- [Nhost Documentation](https://docs.nhost.io/)
- [Hasura GraphQL Engine](https://hasura.io/docs/)
- [IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
- [navigator.onLine](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/onLine)
