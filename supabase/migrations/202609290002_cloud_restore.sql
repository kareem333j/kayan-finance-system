create or replace function public.kayan_commit(p_workspace uuid,p_base bigint,p_operation jsonb,p_snapshot jsonb,p_result jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare current_revision bigint; member public.kayan_members; method text:=p_operation->>'method';
begin
 select revision into current_revision from public.kayan_workspaces where id=p_workspace for update;
 if not found then raise exception 'Workspace not found'; end if;
 select * into member from public.kayan_members where id=(p_operation->>'actor')::uuid and workspace_id=p_workspace for share;
 if not found or not member.active then raise exception 'Account unavailable'; end if;
 if method in ('workspace.seed','settings.save','period.approve','admin.reset','backup.restore') and member.role='operator' then raise exception 'Admin required'; end if;
 if method='workspace.seed' and (member.role<>'super_admin' or exists(select 1 from public.kayan_workspaces where id=p_workspace and snapshot is not null)) then raise exception 'Cannot seed workspace'; end if;
 if exists(select 1 from public.kayan_receipts where workspace_id=p_workspace and id=(p_operation->>'id')::uuid) then return false; end if;
 if current_revision<>p_base then return false; end if;
 if method in ('admin.reset','backup.restore') or not exists(select 1 from public.kayan_backups where workspace_id=p_workspace and created_at>now()-interval '1 day') then
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
