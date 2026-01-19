# Migration Guide: Offline-First Cloud Sync

## Overview

The mvp_v2 now includes full offline support with Nhost cloud sync. This guide explains what's changed and how to migrate existing data.

## What's Changed for Users

### New Features (All Backward Compatible)
- ✅ Works offline without internet
- ✅ Automatic cloud sync when online
- ✅ 19 inventory metadata fields (optional)
- ✅ Visual offline/sync status indicators

### What Works the Same
- ✅ All existing inventory data is preserved
- ✅ Local storage still works without Nhost
- ✅ No data loss in migration
- ✅ Field preferences saved locally

## For Existing Users (No Cloud)

### You Can Keep Using It As-Is
Everything still works exactly the same:
- Add items locally
- View items locally
- All data stored in your browser
- No internet required
- No migration needed

### To Enable Cloud Sync Later
1. Create Nhost account
2. Configure `.env.local`
3. Run database schema
4. Next time online, items sync automatically
5. No data loss - everything migrates

## For New Installations

### Default Behavior
1. App starts in **local-only mode**
2. No Nhost required
3. Set `.env.local` to enable sync
4. Everything works the same offline or online

### With Nhost Configured
1. App detects online/offline status
2. Automatically syncs to cloud when available
3. Shows visual status indicators
4. Still works offline if sync fails

## Database Schema Changes

### Local IndexedDB (No Changes)
- Same structure as before
- New `sync_log` table for tracking
- Backward compatible
- Existing data not affected

### Remote Nhost (New)
- New fields added to `inventory` table
- New `sync_log` table for sync tracking
- User isolation via Hasura permissions
- No breaking changes

### Migration Path

```
Existing Data
    ↓
Local IndexedDB (unchanged)
    ↓
[If Nhost Configured]
    ↓
Sync to Cloud on Next Online
    ↓
Cloud PostgreSQL (Nhost)
```

## Data Mapping

### Existing Fields (Same)
- barcode → barcode
- productName → product_name
- quantity → quantity
- unit → unit
- expiryDate → expiry_date
- category → category
- allergens → allergens

### New Optional Fields
When syncing to Nhost, also includes:
- storageLocation
- cost
- purchaseDate
- preferredConsumptionDate
- supplier
- storageNotes
- itemStatus
- lotNumber
- nutritionInfo
- dietaryRestrictions
- priorityLevel
- packaging

## No Data Loss Guarantee

1. **Existing items preserved**: All current inventory stays
2. **Offline works**: Can still use app without internet
3. **Sync optional**: Nhost is optional, not required
4. **Backward compatible**: Old format supported
5. **Clear errors**: Failed syncs show details

## Testing Migration

### Step 1: Verify Local Data
```javascript
// In browser console
const inventory = await getInventory()
console.log(inventory.length) // Your items
```

### Step 2: Enable Nhost (Optional)
```
Create .env.local with Nhost credentials
```

### Step 3: Check Sync Log
```javascript
const pending = await getPendingSyncs()
console.log(pending) // Items to sync
```

### Step 4: Trigger Sync
```javascript
const result = await syncToNhost(nhostClient)
console.log(result) // Sync results
```

## Common Questions

**Q: Will I lose my data?**
A: No. All existing inventory stays in local storage. Nhost is optional.

**Q: Do I have to use Nhost?**
A: No. App works 100% offline without Nhost. It's optional.

**Q: How long does sync take?**
A: Depends on number of items. Average ~100ms per item.

**Q: What if sync fails?**
A: Items stay in sync queue. Automatic retry when online.

**Q: Can I go back to local-only?**
A: Yes. Just don't configure Nhost. Works the same as before.

**Q: What about private data?**
A: Hasura row-level security ensures users only see their own data.

**Q: Can multiple devices sync?**
A: Yes! All devices with same Nhost account sync together.

## Troubleshooting Migration

### Items Not Appearing in Nhost
1. Check `.env.local` has correct credentials
2. Verify Nhost database schema was created
3. Check browser console for errors
4. Review Hasura permissions in Nhost Console

### Sync Stuck on Pending
1. Check internet connection
2. Verify Nhost project is active
3. Check for GraphQL errors in console
4. Ensure Hasura schema is correct

### Duplicate Items After Sync
1. Unlikely, but check `sync_log` table
2. Manually clean up in Nhost Console if needed
3. Report issue with error details

### Lost Items
1. Check local IndexedDB still has data
2. Check Nhost database for synced items
3. Verify browser storage wasn't cleared
4. Check browser console for errors

## Support

For migration help:
1. Check `NHOST_SYNC_SETUP.md` for detailed setup
2. Check `CLOUD_SYNC_QUICK_START.md` for overview
3. Review troubleshooting section in both docs
4. Check browser console (F12) for error messages

## Timeline

- **Today**: Install new version, works locally as before
- **Optional**: Configure Nhost for cloud sync
- **After Config**: Items sync automatically when online
- **Ongoing**: Works seamlessly offline and online

## Rollback Plan

If something goes wrong:
1. Existing local data still in IndexedDB
2. Can revert `.env.local` to disable Nhost
3. All items stay in local storage
4. App continues working

No permanent changes if you decide not to use Nhost.

---

**Ready to migrate?** Follow the Quick Start guide in `CLOUD_SYNC_QUICK_START.md`
