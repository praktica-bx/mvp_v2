# Nhost Setup Checklist

Complete these steps to enable cloud sync with Nhost.

## Pre-Setup (5 minutes)

- [ ] Create Nhost account at https://console.nhost.io
- [ ] Create a new Nhost project
- [ ] Copy your **Subdomain** (e.g., "proj-abc123xyz")
- [ ] Copy your **Region** (e.g., "us-east-1")
- [ ] Note these down - you'll need them

## Step 1: Environment Configuration (2 minutes)

- [ ] In `mvp_v2/` folder, create file `.env.local`
- [ ] Add these lines:
```env
VITE_NHOST_SUBDOMAIN=your-subdomain-here
VITE_NHOST_REGION=us-east-1
```
- [ ] Replace `your-subdomain-here` with your actual subdomain
- [ ] Save the file

## Step 2: Update Database Schema (5 minutes)

- [ ] Open Nhost Console
- [ ] Go to **Data** → **SQL Editor** (or Query/Console)
- [ ] Open file: `emergency-supply/sql/nhost-schema.sql`
- [ ] Copy the entire file contents
- [ ] Paste into Nhost SQL Editor
- [ ] Click **Run** or **Execute**
- [ ] Wait for success message
- [ ] Verify these tables exist:
  - [ ] `products`
  - [ ] `inventory` (with all new fields)
  - [ ] `user_settings`
  - [ ] `sync_log` (new)

## Step 3: Configure Hasura Permissions (10 minutes)

### For `inventory` Table

- [ ] Go to Nhost Console → **Data**
- [ ] Select `inventory` table
- [ ] Go to **Permissions** tab

**For SELECT (Read)**
- [ ] Click edit role for `user`
- [ ] Set: `user_id` equals `X-Hasura-User-Id`
- [ ] Click ✓

**For INSERT (Create)**
- [ ] Click edit role for `user`
- [ ] Set: `user_id` equals `X-Hasura-User-Id`
- [ ] Click ✓

**For UPDATE (Edit)**
- [ ] Click edit role for `user`
- [ ] Set: `user_id` equals `X-Hasura-User-Id`
- [ ] Click ✓

**For DELETE (Remove)**
- [ ] Click edit role for `user`
- [ ] Set: `user_id` equals `X-Hasura-User-Id`
- [ ] Click ✓

### For `sync_log` Table

- [ ] Go to `sync_log` table
- [ ] Go to **Permissions** tab

**For SELECT**
- [ ] Click edit role for `user`
- [ ] Set: `user_id` equals `X-Hasura-User-Id`
- [ ] Click ✓

**For INSERT**
- [ ] Click edit role for `user`
- [ ] Set: `user_id` equals `X-Hasura-User-Id`
- [ ] Click ✓

**For UPDATE**
- [ ] Click edit role for `user`
- [ ] Set: `user_id` equals `X-Hasura-User-Id`
- [ ] Click ✓

## Step 4: Enable Authentication (5 minutes)

- [ ] Go to Nhost Console → **Settings**
- [ ] Go to **Authentication** section
- [ ] Enable **Email/Password**
- [ ] (Optional) Add your domain to allowed origins
- [ ] Save settings

## Step 5: Start the App (2 minutes)

```bash
cd mvp_v2
npm run dev
```

- [ ] Open browser to http://localhost:5173/
- [ ] App loads without errors
- [ ] Check browser console (F12) for any errors

## Step 6: Test Offline Functionality (5 minutes)

- [ ] Open DevTools (F12)
- [ ] Go to **Network** tab
- [ ] Check "**Offline**" checkbox
- [ ] Try adding an inventory item
- [ ] Should see **red warning banner** "📵 You are offline"
- [ ] Item should save locally
- [ ] Uncheck "Offline" checkbox
- [ ] Should see **blue reminder** "📤 Items waiting to sync"
- [ ] Watch items auto-sync

## Step 7: Verify Cloud Sync (5 minutes)

- [ ] Go to Nhost Console → **Data** → **SQL Editor**
- [ ] Run this query:
```sql
SELECT * FROM inventory ORDER BY created_at DESC LIMIT 1;
```
- [ ] Should see your test item in the results
- [ ] Check the `user_id` matches your Nhost user
- [ ] All fields populated correctly

## Step 8: Check Sync Log (5 minutes)

- [ ] In browser console, run:
```javascript
const synced = await getSyncLog('synced')
console.log(synced)
```
- [ ] Should see entries with status "synced"
- [ ] Timestamps should show when sync occurred

## Troubleshooting

### "ReferenceError: nhost is not defined"
- [ ] Check `.env.local` is in correct location
- [ ] Verify `VITE_NHOST_SUBDOMAIN` is set
- [ ] Restart dev server

### Items not syncing to cloud
- [ ] Check Nhost Console → Data → inventory table exists
- [ ] Verify permissions are set correctly
- [ ] Check browser console for GraphQL errors
- [ ] Ensure `.env.local` has correct credentials

### Can't see my synced item in Nhost
- [ ] Check you're logged in to correct Nhost account
- [ ] Verify database was selected in SQL Editor
- [ ] Check `user_id` in query matches your user

### "inventory table does not exist"
- [ ] Re-run SQL schema from Step 2
- [ ] Make sure you copied ENTIRE file
- [ ] Check for SQL syntax errors in console

### Offline not detecting
- [ ] Check DevTools Network → Offline checkbox
- [ ] Reload page after toggling
- [ ] Check `navigator.onLine` in console

## Success Indicators

✅ Items save offline (red banner appears)
✅ Items sync online (blue banner appears, then disappears)
✅ No errors in browser console
✅ Items appear in Nhost Database
✅ Multiple devices can sync together

## Next Steps

1. Share app with other devices on same network
2. Test multi-device sync
3. Test various offline/online scenarios
4. Set up auto-deployments
5. Monitor sync logs in production

## Support

If stuck:
1. Check `NHOST_SYNC_SETUP.md` for detailed guide
2. Review browser console errors (F12)
3. Check Nhost Console for database/permission issues
4. Verify `.env.local` configuration

---

**Done? Great!** Your Emergency Supply Manager now has cloud sync enabled. Users can work offline and all data syncs automatically! 🎉
