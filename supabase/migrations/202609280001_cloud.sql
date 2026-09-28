-- Apply once using Supabase migrations. No desktop client can read snapshots,
-- write memberships, or call the commit function directly.
create table public.kayan_workspaces (
 id uuid primary key default gen_random_uuid(), name text not null,
 revision bigint not null default 0, snapshot jsonb,
 updated_at timestamptz not null default now()
);
create table public.kayan_members (
 id uuid primary key references auth.users(id) on delete cascade,
 workspace_id uuid not null references public.kayan_workspaces(id),
 username text not null check(username ~ '^[a-zA-Z0-9_.-]{3,40}$'),
 name text not null, login_email text not null unique, role text not null check(role in ('operator','admin','super_admin')),
 active boolean not null default true, is_hidden boolean not null default false,
 version bigint not null default 1,
 unique(workspace_id,username)
);
create unique index kayan_members_username on public.kayan_members(workspace_id,lower(username));
create table public.kayan_receipts (
 workspace_id uuid not null references public.kayan_workspaces(id), id uuid not null,
 actor uuid not null, operation jsonb not null, result jsonb,
 revision bigint not null, created_at timestamptz not null default now(),
 primary key(workspace_id,id)
);
create table public.kayan_backups (
 id bigint generated always as identity primary key, workspace_id uuid not null,
 revision bigint not null, snapshot jsonb not null,
 created_at timestamptz not null default now()
);
-- Realtime publishes only a revision hint, never payroll/account contents.
create table public.kayan_notifications (
 workspace_id uuid primary key references public.kayan_workspaces(id),
 revision bigint not null default 0, updated_at timestamptz not null default now()
);
alter table public.kayan_workspaces enable row level security;
alter table public.kayan_members enable row level security;
alter table public.kayan_receipts enable row level security;
alter table public.kayan_backups enable row level security;
alter table public.kayan_notifications enable row level security;
revoke all on public.kayan_workspaces,public.kayan_members,public.kayan_receipts,public.kayan_backups,public.kayan_notifications from anon,authenticated;
grant all on public.kayan_workspaces,public.kayan_members,public.kayan_receipts,public.kayan_backups,public.kayan_notifications to service_role;
grant usage,select on sequence public.kayan_backups_id_seq to service_role;
grant select on public.kayan_notifications to authenticated;
create function public.kayan_can_watch(workspace uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.kayan_members m where m.id=auth.uid() and m.workspace_id=workspace and m.active);
$$;
revoke all on function public.kayan_can_watch(uuid) from public,anon;
grant execute on function public.kayan_can_watch(uuid) to authenticated;
create policy kayan_watch on public.kayan_notifications for select to authenticated using(public.kayan_can_watch(workspace_id));
alter publication supabase_realtime add table public.kayan_notifications;

create function public.kayan_commit(p_workspace uuid,p_base bigint,p_operation jsonb,p_snapshot jsonb,p_result jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare current_revision bigint; member public.kayan_members; method text:=p_operation->>'method';
begin
 select revision into current_revision from public.kayan_workspaces where id=p_workspace for update;
 if not found then raise exception 'Workspace not found'; end if;
 select * into member from public.kayan_members where id=(p_operation->>'actor')::uuid and workspace_id=p_workspace for share;
 if not found or not member.active then raise exception 'Account unavailable'; end if;
 if method in ('workspace.seed','settings.save','period.approve','admin.reset') and member.role='operator' then raise exception 'Admin required'; end if;
 if method='workspace.seed' and (member.role<>'super_admin' or exists(select 1 from public.kayan_workspaces where id=p_workspace and snapshot is not null)) then raise exception 'Cannot seed workspace'; end if;
 if exists(select 1 from public.kayan_receipts where workspace_id=p_workspace and id=(p_operation->>'id')::uuid) then return false; end if;
 if current_revision<>p_base then return false; end if;
 if method='admin.reset' or not exists(select 1 from public.kayan_backups where workspace_id=p_workspace and created_at>now()-interval '1 day') then
  insert into public.kayan_backups(workspace_id,revision,snapshot) select id,revision,snapshot from public.kayan_workspaces where id=p_workspace and snapshot is not null;
 end if;
 update public.kayan_workspaces set snapshot=p_snapshot,revision=revision+1,updated_at=now() where id=p_workspace;
 insert into public.kayan_receipts(workspace_id,id,actor,operation,result,revision) values(p_workspace,(p_operation->>'id')::uuid,member.id,p_operation,p_result,p_base+1);
 insert into public.kayan_notifications(workspace_id,revision) values(p_workspace,p_base+1) on conflict(workspace_id) do update set revision=excluded.revision,updated_at=now();
 -- Keep the last seven backup snapshots; receipts are retained for idempotency.
 delete from public.kayan_backups where workspace_id=p_workspace and id not in(select id from public.kayan_backups where workspace_id=p_workspace order by id desc limit 7);
 return true;
end;
$$;
revoke all on function public.kayan_commit(uuid,bigint,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.kayan_commit(uuid,bigint,jsonb,jsonb,jsonb) to service_role;

create function public.kayan_save_member(p_workspace uuid,p_actor uuid,p_id uuid,p_value jsonb,p_expected bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor public.kayan_members; old public.kayan_members; saved public.kayan_members; rev bigint;
begin
 perform 1 from public.kayan_workspaces where id=p_workspace for update;
 select * into actor from public.kayan_members where id=p_actor and workspace_id=p_workspace;
 if not found or not actor.active or actor.role='operator' then raise exception 'Admin required'; end if;
 select * into old from public.kayan_members where id=p_id and workspace_id=p_workspace;
 if coalesce(old.version,0)<>p_expected then raise exception 'Account changed'; end if;
 if actor.role<>'super_admin' and (coalesce(old.is_hidden,false) or old.role='super_admin' or p_value->>'role'='super_admin' or (p_value->>'is_hidden')::boolean<>coalesce(old.is_hidden,false)) then raise exception 'Super admin required'; end if;
 if p_id=p_actor and (not (p_value->>'active')::boolean or p_value->>'role'<>actor.role) then raise exception 'Cannot disable or demote yourself'; end if;
 if old.role='super_admin' and (not (p_value->>'active')::boolean or p_value->>'role'<>'super_admin') and not exists(select 1 from public.kayan_members where workspace_id=p_workspace and id<>p_id and active and role='super_admin') then raise exception 'An active super admin is required'; end if;
 insert into public.kayan_members(id,workspace_id,username,name,login_email,role,active,is_hidden)
 values(p_id,p_workspace,p_value->>'username',p_value->>'name',p_value->>'login_email',p_value->>'role',(p_value->>'active')::boolean,(p_value->>'is_hidden')::boolean)
 on conflict(id) do update set username=excluded.username,name=excluded.name,role=excluded.role,active=excluded.active,is_hidden=excluded.is_hidden,version=public.kayan_members.version+1
 returning * into saved;
 update public.kayan_workspaces set revision=revision+1,updated_at=now() where id=p_workspace returning revision into rev;
 insert into public.kayan_notifications(workspace_id,revision) values(p_workspace,rev) on conflict(workspace_id) do update set revision=excluded.revision,updated_at=now();
 return to_jsonb(saved);
end;
$$;
revoke all on function public.kayan_save_member(uuid,uuid,uuid,jsonb,bigint) from public,anon,authenticated;
grant execute on function public.kayan_save_member(uuid,uuid,uuid,jsonb,bigint) to service_role;
