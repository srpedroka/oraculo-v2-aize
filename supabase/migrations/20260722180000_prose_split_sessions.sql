alter table public.ai_control_policies
  add column if not exists prose_split_enabled boolean not null default false;

comment on column public.ai_control_policies.prose_split_enabled is
  'Experimento owner-only: separa a fala planning da extracao estrutural background.';

alter table public.planning_sessions
  add column if not exists revision bigint not null default 0,
  add column if not exists processing_token uuid,
  add column if not exists processing_expires_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'planning_sessions_revision_nonnegative'
      and conrelid = 'public.planning_sessions'::regclass
  ) then
    alter table public.planning_sessions
      add constraint planning_sessions_revision_nonnegative check (revision >= 0);
  end if;
end;
$$;

create index if not exists planning_sessions_processing_lease_idx
on public.planning_sessions (id, processing_expires_at)
where processing_token is not null;

create or replace function public.claim_planning_session_turn(
  p_session_id uuid,
  p_user_id uuid,
  p_token uuid,
  p_lease_seconds integer default 180
)
returns setof public.planning_sessions
language sql
security invoker
set search_path = public
as $$
  update public.planning_sessions session
  set processing_token = p_token,
      processing_expires_at = clock_timestamp() + make_interval(secs => least(greatest(p_lease_seconds, 30), 300))
  where session.id = p_session_id
    and session.user_id = p_user_id
    and session.status = 'active'
    and (
      session.processing_token is null
      or session.processing_expires_at is null
      or session.processing_expires_at <= clock_timestamp()
    )
  returning session.*;
$$;

create or replace function public.release_planning_session_turn(
  p_session_id uuid,
  p_token uuid
)
returns boolean
language sql
security invoker
set search_path = public
as $$
  with released as (
    update public.planning_sessions session
    set processing_token = null,
        processing_expires_at = null
    where session.id = p_session_id
      and session.processing_token = p_token
    returning 1
  )
  select exists(select 1 from released);
$$;

revoke all on function public.claim_planning_session_turn(uuid, uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.release_planning_session_turn(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_planning_session_turn(uuid, uuid, uuid, integer) to service_role;
grant execute on function public.release_planning_session_turn(uuid, uuid) to service_role;
