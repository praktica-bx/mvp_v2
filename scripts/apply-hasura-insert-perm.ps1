<#
Apply Hasura Insert permission for `inventory`.
This script prompts for the Hasura admin secret (secure input) and POSTs to /v1/metadata.
Do NOT commit this file with secrets; add to .gitignore if needed.
#>

$HASURA_ENDPOINT = "https://vfiubptgcthtqjidepng.hasura.eu-central-1.nhost.run/v1/metadata"

Write-Host "This script will prompt for your Hasura admin secret (not echoed)."
$secure = Read-Host "Enter Hasura admin secret" -AsSecureString
$ADMIN_SECRET = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
  [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
)

# sanitize secret: remove accidental newlines/tabs and trim
$ADMIN_SECRET = $ADMIN_SECRET -replace '[\r\n\t]', ''
$ADMIN_SECRET = $ADMIN_SECRET.Trim()

# validate no control characters remain
if ($ADMIN_SECRET -match '[\x00-\x1F]') {
  Write-Host "Admin secret contains invalid control characters. Re-enter without newlines." -ForegroundColor Red
  exit 1
}

$payload = @{
  type = "pg_create_insert_permission"
  args = @{
    table = @{ schema = "public"; name = "inventory" }
    role = "user"
    permission = @{
      columns = @(
        "product_id","barcode","product_name","quantity","unit","expiry_date",
        "purchase_date","preferred_consumption_date","storage_location","item_status",
        "storage_notes","allergens","dietary_restrictions","cost","supplier","lot_number",
        "nutrition_info","priority_level","packaging","image_url","allowGracePeriod",
        "gracePeriodMonths","battery_capacity","batteryCapacity","lumen","calories_per_serving",
        "caloriesPerServing","servings_per_package","servingsPerPackage","power_rating","powerRating",
        "medication_form","medicationForm","documents_type","documentsType","special_needs_details",
        "specialNeedsDetails","storage_temperature","storageTemperature","container_type","containerType",
        "_deleted"
      )
      check = @{}
      set = @{ owner_id = "X-Hasura-User-Id" }
    }
  }
}

$body = $payload | ConvertTo-Json -Depth 10

Write-Host "Posting metadata to $HASURA_ENDPOINT ..."
try {
  $resp = Invoke-RestMethod -Uri $HASURA_ENDPOINT -Method Post -Headers @{ "x-hasura-admin-secret" = $ADMIN_SECRET } -Body $body -ContentType "application/json"
  Write-Host "Success:" -ForegroundColor Green
  $resp | ConvertTo-Json -Depth 10
} catch {
  Write-Host "Request failed:" -ForegroundColor Red
  $_ | Format-List * -Force
}

Write-Host "Done. Verify in Hasura Console → Data → public → inventory → Permissions."
