-- One-time password migration, accessible only to the trusted Edge Function.
create table public.kayan_legacy_passwords (
 user_id uuid primary key references auth.users(id) on delete cascade,
 salt text not null check(salt ~ '^[a-f0-9]{48}$'),
 hash text not null check(hash ~ '^[a-f0-9]{128}$')
);
alter table public.kayan_legacy_passwords enable row level security;
revoke all on public.kayan_legacy_passwords from public,anon,authenticated;
grant all on public.kayan_legacy_passwords to service_role;
