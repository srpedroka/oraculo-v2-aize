-- Etapa 6 / Fatia 6D: direitos da conta pessoal e desligamento seguro.

create table if not exists public.personal_data_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  subject_fingerprint text not null,
  request_type text not null check (request_type in ('export', 'account_deletion')),
  status text not null default 'pending' check (status in ('pending', 'completed', 'blocked', 'failed')),
  result_summary jsonb not null default '{}'::jsonb,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint personal_data_requests_fingerprint_length check (char_length(subject_fingerprint) = 64),
  constraint personal_data_requests_summary_object check (jsonb_typeof(result_summary) = 'object')
);

create index if not exists personal_data_requests_user_requested_idx
on public.personal_data_requests (user_id, requested_at desc)
where user_id is not null;

create index if not exists personal_data_requests_fingerprint_requested_idx
on public.personal_data_requests (subject_fingerprint, requested_at desc);

alter table public.personal_data_requests enable row level security;
revoke all on public.personal_data_requests from public, anon, authenticated;
grant select, insert, update on public.personal_data_requests to service_role;

-- Business records survive account deletion. Only the identifying profile link is
-- removed. Membership is intentionally left as cascade because it is access, not
-- business history.
alter table public.organizations
  drop constraint if exists organizations_created_by_fkey,
  add constraint organizations_created_by_fkey foreign key (created_by) references public.profiles(id) on delete set null;

alter table public.evidences
  drop constraint if exists evidences_created_by_fkey,
  add constraint evidences_created_by_fkey foreign key (created_by) references public.profiles(id) on delete set null;

alter table public.check_ins
  drop constraint if exists check_ins_created_by_fkey,
  add constraint check_ins_created_by_fkey foreign key (created_by) references public.profiles(id) on delete set null;

alter table public.plan_documents
  drop constraint if exists plan_documents_created_by_fkey,
  add constraint plan_documents_created_by_fkey foreign key (created_by) references public.profiles(id) on delete set null;

alter table public.kpi_monthly_values
  drop constraint if exists kpi_monthly_values_updated_by_fkey,
  add constraint kpi_monthly_values_updated_by_fkey foreign key (updated_by) references public.profiles(id) on delete set null;

alter table public.conversations alter column user_id drop not null;
alter table public.conversations
  drop constraint if exists conversations_user_id_fkey,
  add constraint conversations_user_id_fkey foreign key (user_id) references public.profiles(id) on delete set null;

alter table public.planning_sessions alter column user_id drop not null;
alter table public.planning_sessions
  drop constraint if exists planning_sessions_user_id_fkey,
  add constraint planning_sessions_user_id_fkey foreign key (user_id) references public.profiles(id) on delete set null;

alter table public.organization_restore_runs alter column initiated_by drop not null;
alter table public.organization_restore_runs
  drop constraint if exists organization_restore_runs_initiated_by_fkey,
  add constraint organization_restore_runs_initiated_by_fkey foreign key (initiated_by) references public.profiles(id) on delete set null;

alter table public.org_ai_tone
  drop constraint if exists org_ai_tone_updated_by_fkey,
  add constraint org_ai_tone_updated_by_fkey foreign key (updated_by) references auth.users(id) on delete set null;

-- Auth email is the source of truth. A confirmed email change is reflected in the
-- public profile without letting the browser forge another account identity.
create or replace function public.sync_profile_email_from_auth()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles
    set email = new.email
    where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
after update of email on auth.users
for each row execute function public.sync_profile_email_from_auth();

-- This trigger protects every Auth deletion path, including Admin Auth. It also
-- anonymizes the surviving lifecycle audit in the same transaction.
create or replace function public.guard_and_anonymize_profile_deletion()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  blocking_org_name text;
begin
  perform 1
  from public.memberships membership
  where membership.org_id in (
    select owned.org_id
    from public.memberships owned
    where owned.user_id = old.id
      and owned.role = 'owner'
  )
  order by membership.org_id, membership.id
  for update;

  select organization.name
  into blocking_org_name
  from public.memberships owned
  join public.organizations organization on organization.id = owned.org_id
  where owned.user_id = old.id
    and owned.role = 'owner'
    and (
      select count(*)
      from public.memberships other_owner
      where other_owner.org_id = owned.org_id
        and other_owner.role = 'owner'
    ) <= 1
  order by organization.name
  limit 1;

  if blocking_org_name is not null then
    raise exception 'Você é o único dono de %. Promova outro owner ou encerre a empresa antes de excluir a conta.', blocking_org_name;
  end if;

  update public.organization_lifecycle_audit
  set actor_user_id = null,
      actor_email = null,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('actorAnonymized', true)
  where actor_user_id = old.id;

  return old;
end;
$$;

drop trigger if exists before_profile_delete_guard on public.profiles;
create trigger before_profile_delete_guard
before delete on public.profiles
for each row execute function public.guard_and_anonymize_profile_deletion();

-- Leaving or being removed from the final organization immediately disconnects
-- the phone from WhatsApp while preserving the Auth account and business records.
create or replace function public.clear_unaffiliated_profile_phone()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.memberships where user_id = old.user_id
  ) then
    update public.profiles set phone = null where id = old.user_id;
  end if;
  return old;
end;
$$;

drop trigger if exists after_membership_delete_clear_phone on public.memberships;
create trigger after_membership_delete_clear_phone
after delete on public.memberships
for each row execute function public.clear_unaffiliated_profile_phone();

comment on table public.personal_data_requests is
  'Trilha service-only de exportações pessoais e exclusões de conta; após exclusão mantém somente fingerprint e resumo sanitizado.';
comment on function public.guard_and_anonymize_profile_deletion() is
  'Impede apagar o último owner e anonimiza autoria pessoal sem remover o histórico empresarial.';
comment on function public.clear_unaffiliated_profile_phone() is
  'Remove o telefone quando a pessoa perde seu último vínculo empresarial, interrompendo o acesso via WhatsApp.';

select public.record_destructive_schema_change(array['20260715170000_personal_account_lifecycle.sql']);
