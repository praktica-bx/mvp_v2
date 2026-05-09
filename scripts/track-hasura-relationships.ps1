<#
  Track Hasura FK relationships for Emergency Supply Manager.
  Creates array and object relationships between public tables.

  Usage:
    .\scripts\track-hasura-relationships.ps1 -AdminSecret "your-secret-here"
#>
param(
  [string]$AdminSecret = ""
)

$HASURA_ENDPOINT = "https://bjuqirpkrncqqkvynnsv.hasura.eu-central-1.nhost.run/v1/metadata"

if (-not $AdminSecret) {
  Write-Host "No admin secret provided." -ForegroundColor Red
  exit 1
}
$ADMIN_SECRET = $AdminSecret.Trim() -replace '[\r\n\t]', ''
$headers = @{ "x-hasura-admin-secret" = $ADMIN_SECRET; "Content-Type" = "application/json" }

function Apply-Rel($label, $payload) {
  $body = $payload | ConvertTo-Json -Depth 10 -Compress
  try {
    $resp = Invoke-RestMethod -Uri $HASURA_ENDPOINT -Method Post -Headers $headers -Body $body
    Write-Host "  OK: $label" -ForegroundColor Green
  } catch {
    $msg = $_.ErrorDetails.Message
    if ($msg -match "already exists") {
      Write-Host "  SKIP (already exists): $label" -ForegroundColor Yellow
    } else {
      Write-Host "  FAIL: $label => $msg" -ForegroundColor Red
    }
  }
}

Write-Host "Tracking Hasura relationships..." -ForegroundColor Cyan

# households -> household_members  (array relationship)
Apply-Rel "households.household_members" @{
  type = "pg_create_array_relationship"
  args = @{
    source = "default"
    table = @{ schema = "public"; name = "households" }
    name = "household_members"
    using = @{
      foreign_key_constraint_on = @{
        table = @{ schema = "public"; name = "household_members" }
        column = "household_id"
      }
    }
  }
}

# households -> inventory  (array relationship)
Apply-Rel "households.inventory" @{
  type = "pg_create_array_relationship"
  args = @{
    source = "default"
    table = @{ schema = "public"; name = "households" }
    name = "inventory"
    using = @{
      foreign_key_constraint_on = @{
        table = @{ schema = "public"; name = "inventory" }
        column = "household_id"
      }
    }
  }
}

# household_members -> households  (object relationship)
Apply-Rel "household_members.household" @{
  type = "pg_create_object_relationship"
  args = @{
    source = "default"
    table = @{ schema = "public"; name = "household_members" }
    name = "household"
    using = @{
      foreign_key_constraint_on = "household_id"
    }
  }
}

# inventory -> households  (object relationship)
Apply-Rel "inventory.household" @{
  type = "pg_create_object_relationship"
  args = @{
    source = "default"
    table = @{ schema = "public"; name = "inventory" }
    name = "household"
    using = @{
      foreign_key_constraint_on = "household_id"
    }
  }
}

# inventory -> products  (object relationship)
Apply-Rel "inventory.product" @{
  type = "pg_create_object_relationship"
  args = @{
    source = "default"
    table = @{ schema = "public"; name = "inventory" }
    name = "product"
    using = @{
      foreign_key_constraint_on = "product_id"
    }
  }
}

# products -> inventory  (array relationship)
Apply-Rel "products.inventory" @{
  type = "pg_create_array_relationship"
  args = @{
    source = "default"
    table = @{ schema = "public"; name = "products" }
    name = "inventory"
    using = @{
      foreign_key_constraint_on = @{
        table = @{ schema = "public"; name = "inventory" }
        column = "product_id"
      }
    }
  }
}

Write-Host "Done." -ForegroundColor Cyan
