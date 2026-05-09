<#
  Apply all Hasura permissions for Emergency Supply Manager.
  Sets select/insert/update/delete for role 'user' on all public tables.

  Usage:
    .\scripts\apply-hasura-permissions.ps1 -AdminSecret "your-secret-here"
  Or omit -AdminSecret to be prompted interactively.
#>
param(
  [string]$AdminSecret = ""
)

$HASURA_ENDPOINT = "https://bjuqirpkrncqqkvynnsv.hasura.eu-central-1.nhost.run/v1/metadata"

Write-Host "Hasura endpoint: $HASURA_ENDPOINT"

if (-not $AdminSecret) {
  $secure = Read-Host "Enter Hasura admin secret" -AsSecureString
  $AdminSecret = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  )
}
$ADMIN_SECRET = $AdminSecret.Trim() -replace '[\r\n\t]', ''

if (-not $ADMIN_SECRET) {
  Write-Host "No admin secret provided." -ForegroundColor Red
  exit 1
}

$headers = @{ "x-hasura-admin-secret" = $ADMIN_SECRET; "Content-Type" = "application/json" }

function Apply-Permission($label, $payload) {
  $body = $payload | ConvertTo-Json -Depth 15 -Compress
  try {
    $resp = Invoke-RestMethod -Uri $HASURA_ENDPOINT -Method Post -Headers $headers -Body $body
    Write-Host "  OK: $label" -ForegroundColor Green
  } catch {
    $msg = $_.ErrorDetails.Message
    if ($msg -match "already exists") {
      Write-Host "  SKIP (already exists): $label" -ForegroundColor Yellow
    } else {
      Write-Host "  FAIL: $label" -ForegroundColor Red
      Write-Host "        $msg"
    }
  }
}

$userFilter_owner  = @{ owner_id = @{ "_eq" = "X-Hasura-User-Id" } }
$userFilter_userId = @{ user_id  = @{ "_eq" = "X-Hasura-User-Id" } }
$noFilter = @{}

Write-Host "`n--- households ---"
Apply-Permission "households select" @{
  type = "pg_create_select_permission"
  args = @{ table = @{schema="public";name="households"}; role = "user"
            permission = @{ columns = "*"; filter = $userFilter_owner; allow_aggregations = $true } }
}
Apply-Permission "households insert" @{
  type = "pg_create_insert_permission"
  args = @{ table = @{schema="public";name="households"}; role = "user"
            permission = @{ columns = @("name","invite_code"); check = $noFilter
                            set = @{ owner_id = "X-Hasura-User-Id" } } }
}
Apply-Permission "households update" @{
  type = "pg_create_update_permission"
  args = @{ table = @{schema="public";name="households"}; role = "user"
            permission = @{ columns = @("name","invite_code"); filter = $userFilter_owner } }
}
Apply-Permission "households delete" @{
  type = "pg_create_delete_permission"
  args = @{ table = @{schema="public";name="households"}; role = "user"
            permission = @{ filter = $userFilter_owner } }
}

Write-Host "`n--- household_members ---"
Apply-Permission "household_members select" @{
  type = "pg_create_select_permission"
  args = @{ table = @{schema="public";name="household_members"}; role = "user"
            permission = @{ columns = "*"; filter = $userFilter_userId } }
}
Apply-Permission "household_members insert" @{
  type = "pg_create_insert_permission"
  args = @{ table = @{schema="public";name="household_members"}; role = "user"
            permission = @{ columns = @("household_id","role"); check = $noFilter
                            set = @{ user_id = "X-Hasura-User-Id" } } }
}
Apply-Permission "household_members delete" @{
  type = "pg_create_delete_permission"
  args = @{ table = @{schema="public";name="household_members"}; role = "user"
            permission = @{ filter = $userFilter_userId } }
}

Write-Host "`n--- inventory ---"
$invCols = @(
  "id","household_id","product_id","barcode","product_name","quantity","unit",
  "expiry_date","purchase_date","preferred_consumption_date","storage_location",
  "item_status","storage_notes","allergens","dietary_restrictions","cost","supplier",
  "lot_number","nutrition_info","priority_level","packaging","image_url",
  "allowgraceperiod","graceperiodmonths","allowGracePeriod","gracePeriodMonths","imageUrl",
  "_deleted","battery_capacity","batteryCapacity","lumen","calories_per_serving",
  "caloriesPerServing","servings_per_package","servingsPerPackage","power_rating","powerRating",
  "medication_form","medicationForm","documents_type","documentsType",
  "special_needs_details","specialNeedsDetails","storage_temperature","storageTemperature",
  "container_type","containerType","added_at","updated_at"
)
Apply-Permission "inventory select" @{
  type = "pg_create_select_permission"
  args = @{ table = @{schema="public";name="inventory"}; role = "user"
            permission = @{ columns = "*"; filter = $userFilter_userId; allow_aggregations = $true } }
}
Apply-Permission "inventory insert" @{
  type = "pg_create_insert_permission"
  args = @{ table = @{schema="public";name="inventory"}; role = "user"
            permission = @{ columns = $invCols; check = $noFilter
                            set = @{ user_id = "X-Hasura-User-Id" } } }
}
Apply-Permission "inventory update" @{
  type = "pg_create_update_permission"
  args = @{ table = @{schema="public";name="inventory"}; role = "user"
            permission = @{ columns = $invCols; filter = $userFilter_userId } }
}
Apply-Permission "inventory delete" @{
  type = "pg_create_delete_permission"
  args = @{ table = @{schema="public";name="inventory"}; role = "user"
            permission = @{ filter = $userFilter_userId } }
}

Write-Host "`n--- products ---"
Apply-Permission "products select" @{
  type = "pg_create_select_permission"
  args = @{ table = @{schema="public";name="products"}; role = "user"
            permission = @{ columns = "*"; filter = $noFilter } }
}
Apply-Permission "products insert" @{
  type = "pg_create_insert_permission"
  args = @{ table = @{schema="public";name="products"}; role = "user"
            permission = @{ columns = @("product_name","brand","barcode","image_url","imageUrl")
                            check = $noFilter } }
}

Write-Host "`n--- user_settings ---"
Apply-Permission "user_settings select" @{
  type = "pg_create_select_permission"
  args = @{ table = @{schema="public";name="user_settings"}; role = "user"
            permission = @{ columns = "*"; filter = $userFilter_userId } }
}
Apply-Permission "user_settings insert" @{
  type = "pg_create_insert_permission"
  args = @{ table = @{schema="public";name="user_settings"}; role = "user"
            permission = @{ columns = @("household_id","settings"); check = $noFilter
                            set = @{ user_id = "X-Hasura-User-Id" } } }
}
Apply-Permission "user_settings update" @{
  type = "pg_create_update_permission"
  args = @{ table = @{schema="public";name="user_settings"}; role = "user"
            permission = @{ columns = @("settings","household_id"); filter = $userFilter_userId } }
}
Apply-Permission "user_settings delete" @{
  type = "pg_create_delete_permission"
  args = @{ table = @{schema="public";name="user_settings"}; role = "user"
            permission = @{ filter = $userFilter_userId } }
}

Write-Host "`n--- sync_log ---"
Apply-Permission "sync_log select" @{
  type = "pg_create_select_permission"
  args = @{ table = @{schema="public";name="sync_log"}; role = "user"
            permission = @{ columns = "*"; filter = $userFilter_userId } }
}
Apply-Permission "sync_log insert" @{
  type = "pg_create_insert_permission"
  args = @{ table = @{schema="public";name="sync_log"}; role = "user"
            permission = @{ columns = @("operation","table_name","record_id","data","status")
                            check = $noFilter; set = @{ user_id = "X-Hasura-User-Id" } } }
}
Apply-Permission "sync_log update" @{
  type = "pg_create_update_permission"
  args = @{ table = @{schema="public";name="sync_log"}; role = "user"
            permission = @{ columns = @("status","error","synced_at"); filter = $userFilter_userId } }
}
Apply-Permission "sync_log delete" @{
  type = "pg_create_delete_permission"
  args = @{ table = @{schema="public";name="sync_log"}; role = "user"
            permission = @{ filter = $userFilter_userId } }
}

Write-Host "`nDone. Refresh the app and check browser console for errors." -ForegroundColor Cyan
