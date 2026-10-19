-- Run in the Supabase SQL Editor before enabling email verification.
-- New signups remain pending and do not become users until verification.

alter table public.users
  add column if not exists email_verification_required boolean
    not null default false,
  add column if not exists email_verification_token_hash text,
  add column if not exists email_verification_expires_at timestamptz,
  add column if not exists email_verification_sent_at timestamptz;

create unique index if not exists idx_users_email_verification_token_hash_unique
  on public.users(email_verification_token_hash)
  where email_verification_token_hash is not null;

create table if not exists public.pending_user_registrations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  password_hash text not null,
  role text not null check (
    role in ('buyer', 'business_seller', 'individual_seller')
  ),
  interests jsonb not null default '[]'::jsonb,
  email_verification_token_hash text not null unique,
  email_verification_expires_at timestamptz not null,
  email_verification_sent_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_pending_user_registrations_expiry
  on public.pending_user_registrations(email_verification_expires_at);

alter table public.pending_user_registrations
  enable row level security;

create or replace function public.complete_pending_user_registration(
  p_token_hash text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  pending public.pending_user_registrations%rowtype;
  created_user_id uuid;
begin
  select *
    into pending
    from public.pending_user_registrations
   where email_verification_token_hash = p_token_hash
     and email_verification_expires_at > now()
   for update;

  if not found then
    return null;
  end if;

  if exists (
    select 1
      from public.users
     where email = pending.email
  ) then
    delete from public.pending_user_registrations
     where id = pending.id;
    return null;
  end if;

  insert into public.users (
    name,
    email,
    password_hash,
    role,
    interests,
    email_verified,
    email_verification_required,
    email_verification_token_hash,
    email_verification_expires_at,
    email_verification_sent_at,
    is_active
  )
  values (
    pending.name,
    pending.email,
    pending.password_hash,
    pending.role,
    pending.interests,
    true,
    true,
    null,
    null,
    pending.email_verification_sent_at,
    true
  )
  returning id into created_user_id;

  delete from public.pending_user_registrations
   where id = pending.id;

  return created_user_id;
exception
  when unique_violation then
    if pending.id is not null then
      delete from public.pending_user_registrations
       where id = pending.id;
    end if;
    return null;
end;
$$;

revoke all on function public.complete_pending_user_registration(text)
  from public, anon, authenticated;
grant execute on function public.complete_pending_user_registration(text)
  to service_role;
