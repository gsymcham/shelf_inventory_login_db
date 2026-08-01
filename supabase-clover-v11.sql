-- Shelf2 V11 Clover OAuth sandbox foundation
create extension if not exists pgcrypto;

create table if not exists public.clover_connections (
  merchant_id text primary key,
  merchant_name text,
  environment text not null default 'sandbox' check (environment in ('sandbox','production')),
  access_token_ciphertext text not null,
  access_token_iv text not null,
  refresh_token_ciphertext text,
  refresh_token_iv text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_verified_at timestamptz,
  last_error text
);

create table if not exists public.clover_oauth_attempts (
  id uuid primary key default gen_random_uuid(),
  nonce_hash text not null unique,
  merchant_id text,
  return_url text,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists clover_oauth_attempts_expires_idx on public.clover_oauth_attempts(expires_at);

alter table public.clover_connections enable row level security;
alter table public.clover_oauth_attempts enable row level security;

revoke all on public.clover_connections from anon, authenticated;
revoke all on public.clover_oauth_attempts from anon, authenticated;

create or replace function public.admin_clover_connection_status()
returns table (
  connected boolean,
  merchant_id text,
  merchant_name text,
  environment text,
  connected_at timestamptz,
  updated_at timestamptz,
  last_verified_at timestamptz,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  last_error text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_current_user_admin() then
    raise exception 'Admin access required';
  end if;

  return query
  select true, c.merchant_id, c.merchant_name, c.environment, c.connected_at,
         c.updated_at, c.last_verified_at, c.access_token_expires_at,
         c.refresh_token_expires_at, c.last_error
  from public.clover_connections c
  order by c.updated_at desc
  limit 1;
end;
$$;

grant execute on function public.admin_clover_connection_status() to authenticated;

delete from public.clover_oauth_attempts where expires_at < now() - interval '1 day';
