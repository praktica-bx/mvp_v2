# Nhost Cloud Sync - Quick Start Guide

## What's New

Your Emergency Supply Manager now supports **offline-first cloud sync** with Nhost! Users can add inventory items offline and they'll automatically sync when the device comes online.

## Key Features Implemented

✅ **Offline Support**
- Add items while offline
- All data stored locally (no loss)
- Automatic cloud sync when online

✅ **Network Detection**
- Red warning banner when offline
- Blue reminder when items need syncing
- Real-time status detection

✅ **Sync Tracking**
- Tracks pending changes in `sync_log`
- Marks syncs as pending/synced/failed
- Automatic retry on reconnection

✅ **User-Friendly**
- No UI blocking during sync
- Clear visual feedback
- Seamless experience

## To Enable Cloud Sync

### Step 1: Create Nhost Project
1. Go to https://console.nhost.io
2. Create a new project
3. Copy your **Subdomain** (e.g., "abc123xyz")

### Step 2: Configure Environment
Create `.env.local` in `mvp_v2/` folder:

```env
VITE_NHOST_SUBDOMAIN=your-subdomain-here
VITE_NHOST_REGION=us-east-1
```

### Step 3: Update Database Schema
1. In Nhost Console → SQL Editor
2. Copy entire content from `sql/nhost-schema.sql`
3. Run it to create all required tables

### Step 4: Configure Permissions
In Nhost Console → Hasura:
- Set up row-level security for `inventory` table
- Allow users to see/edit only their own data

See `NHOST_SYNC_SETUP.md` for detailed instructions.

## How Users Experience It

### When Offline
- **Red banner appears** at top: "📵 You are offline"
- Users can still add items normally
- Items save to local database
- No internet needed

### When Coming Online
- **Blue banner appears**: "📤 2 items waiting to sync"
- Items automatically sync to cloud
- After sync: banner disappears
- No action needed from user

### If Sync Fails
- Item marked as failed
- Stays in sync queue
- Automatic retry when online
- User can see error details

## File Changes

### New Files
```
mvp_v2/
├── src/nhost.js                      # Nhost client config
├── src/hooks/useOnlineStatus.js      # Network detection
├── src/components/OfflineWarning.jsx # UI warnings
├── NHOST_SYNC_SETUP.md              # Full setup docs
└── .env.example                      # Environment template
```

### Modified Files
```
src/
├── database.js          # Added: syncToNhost(), addSyncLog(), etc.
├── App.jsx              # Added: online detection, sync UI
├── InventoryForm.jsx    # Added: offline tracking
└── App.css              # Added: sync reminder styles

sql/
└── nhost-schema.sql     # Updated: inventory table + sync_log table
```

## Database Changes

### New Inventory Fields (19 total)
Now supporting all these metadata fields:
- Storage location
- Cost/Price
- Purchase date & preferred consumption date
- Supplier & lot number
- Item status (unopened/opened/partially-used/expired)
- Storage notes
- Nutrition info
- Dietary restrictions
- Priority level
- Packaging details

### New Sync Log Table
Tracks all offline changes:
- What was changed (operation)
- When it was changed (timestamp)
- Current status (pending/synced/failed)
- Error messages if failed

## Testing Offline Sync

1. **Open DevTools** (F12)
2. **Go to Network tab**
3. **Check "Offline"** checkbox
4. **Add inventory item** - it saves locally
5. **Uncheck "Offline"** - watch it sync automatically
6. **Check browser console** - see sync logs

## API Functions (For Developers)

```javascript
// Check if device is online
const { isOnline } = useOnlineStatus()

// Get pending syncs
const pending = await getPendingSyncs()

// Sync to Nhost
const result = await syncToNhost(nhostClient)

// Track offline saves
await addSyncLog('create', 'inventory', itemId, itemData)
```

See `NHOST_SYNC_SETUP.md` for complete API reference.

## What's Still Local-Only

The app still works **100% offline** without Nhost:
- ✅ Add items
- ✅ View items
- ✅ Edit items
- ✅ Delete items
- ✅ Category management
- ✅ Field preferences

Nhost just adds cloud sync on top - it's completely optional!

## Support Files

- **NHOST_SYNC_SETUP.md** - Full setup guide
- **.env.example** - Environment configuration
- **sql/nhost-schema.sql** - Database schema to run
- **src/nhost.js** - Nhost client configuration

## Next Steps

1. Create Nhost project
2. Copy Subdomain to `.env.local`
3. Run SQL schema in Nhost
4. Set up Hasura permissions
5. Test offline functionality
6. Deploy to production

See `NHOST_SYNC_SETUP.md` for step-by-step instructions with screenshots.

---

**Questions?** Check the troubleshooting section in `NHOST_SYNC_SETUP.md`
