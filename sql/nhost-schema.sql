-- Nhost schema for Emergency Supply Manager
-- Creates households, household_members, products, inventory, user_settings, sync_log

-- enable pgcrypto for gen_random_uuid()
create extension if not exists pgcrypto;

-- households
create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null,
  invite_code text,
  created_at timestamptz default now()
);

-- household members
create table if not exists public.household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null,
  role text default 'member',
  created_at timestamptz default now()
);

-- products (lightweight product catalog)
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  product_name text,
  brand text,
  barcode text,
  image_url text,
  created_at timestamptz default now()
);

-- inventory
create table if not exists public.inventory (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.households(id) on delete cascade,
  user_id uuid,
  product_id uuid references public.products(id),
  barcode text,
  product_name text,
  quantity numeric default 1,
  unit text,
  expiry_date timestamptz,
  purchase_date timestamptz,
  preferred_consumption_date timestamptz,
  storage_location text,
  item_status text,
  storage_notes text,
  allergens text,
  dietary_restrictions jsonb default '[]'::jsonb,
  cost numeric,
  supplier text,
  lot_number text,
  nutrition_info jsonb,
  priority_level text,
  packaging text,
  image_url text,
  allowgraceperiod boolean default false,
  graceperiodmonths int,
  added_at timestamptz default now(),
  updated_at timestamptz default now(),
  _deleted boolean default false
);

-- user settings
create table if not exists public.user_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  household_id uuid,
  settings jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- sync_log tracks offline operations queued for sync
create table if not exists public.sync_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  operation text not null,
  table_name text not null,
  record_id text,
  data jsonb,
  status text default 'pending',
  error text,
  created_at timestamptz default now(),
  synced_at timestamptz
);

-- Storage locations table for cloud sync
create table if not exists public.storage_locations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null, -- who created the location
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  created_at timestamptz default now()
);

-- Indexes
create index if not exists idx_inventory_household_id on public.inventory(household_id);
create index if not exists idx_inventory_user_id on public.inventory(user_id);
create index if not exists idx_synclog_user_status on public.sync_log(user_id, status);

-- Add camelCase columns expected by the frontend/GraphQL if missing
alter table if exists public.inventory add column if not exists "allowGracePeriod" boolean default false;
alter table if exists public.inventory add column if not exists "gracePeriodMonths" integer;
alter table if exists public.inventory add column if not exists "imageUrl" text;

alter table if exists public.products add column if not exists "imageUrl" text;
-- Additional fields for category-specific data
alter table if exists public.inventory add column if not exists battery_capacity numeric;
alter table if exists public.inventory add column if not exists "batteryCapacity" numeric;
alter table if exists public.inventory add column if not exists lumen numeric;
alter table if exists public.inventory add column if not exists "lumen" numeric;
alter table if exists public.inventory add column if not exists calories_per_serving numeric;
alter table if exists public.inventory add column if not exists "caloriesPerServing" numeric;
alter table if exists public.inventory add column if not exists servings_per_package integer;
alter table if exists public.inventory add column if not exists "servingsPerPackage" integer;
alter table if exists public.inventory add column if not exists power_rating text;
alter table if exists public.inventory add column if not exists "powerRating" text;
alter table if exists public.inventory add column if not exists medication_form text;
alter table if exists public.inventory add column if not exists "medicationForm" text;
alter table if exists public.inventory add column if not exists documents_type text;
alter table if exists public.inventory add column if not exists "documentsType" text;
alter table if exists public.inventory add column if not exists special_needs_details text;
alter table if exists public.inventory add column if not exists "specialNeedsDetails" text;
alter table if exists public.inventory add column if not exists storage_temperature text;
alter table if exists public.inventory add column if not exists "storageTemperature" text;
alter table if exists public.inventory add column if not exists container_type text;
alter table if exists public.inventory add column if not exists "containerType" text;
