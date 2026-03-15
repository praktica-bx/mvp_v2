<#
Apply Hasura Insert permission for `inventory` using secret from clipboard.
Instructions:
  1. Copy your Hasura admin secret into the clipboard (select → Ctrl+C).
  2. Run: powershell -ExecutionPolicy Bypass -File .\scripts\apply-hasura-insert-perm-clipboard.ps1

This avoids typing/pasting into a secure prompt.
#>

$HASURA_ENDPOINT = "https://vfiubptgcthtqjidepng.hasura.eu-central-1.nhost.run/v1/metadata"

Write-Host "Reading Hasura admin secret from clipboard..."
try {
  $ADMIN_SECRET = Get-Clipboard -TextFormatType Text
} catch {
  Write-Host "Failed reading clipboard. Copy the secret first and try again." -ForegroundColor Red
  exit 1
}

# sanitize and validate
$ADMIN_SECRET = ($ADMIN_SECRET -replace '[\r\n\t]', '').Trim()
if ([string]::IsNullOrWhiteSpace($ADMIN_SECRET)) {
  Write-Host "Clipboard appears empty after trimming. Copy the secret and try again." -ForegroundColor Red
  exit 1
}
if ($ADMIN_SECRET -match '[\x00-\x1F]') {
  Write-Host "Admin secret contains control characters. Remove them and try again." -ForegroundColor Red
  exit 1
}

Write-Host "Posting metadata to $HASURA_ENDPOINT ..."

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

try {
  $resp = Invoke-RestMethod -Uri $HASURA_ENDPOINT -Method Post -Headers @{ "x-hasura-admin-secret" = $ADMIN_SECRET } -Body $body -ContentType "application/json"
  Write-Host "Success: permission applied." -ForegroundColor Green
  $resp | ConvertTo-Json -Depth 10
} catch {
  Write-Host "Request failed:" -ForegroundColor Red
  $_ | Format-List * -Force
  exit 1
}

Write-Host "Done. Verify in Hasura Console → Data → public → inventory → Permissions."
