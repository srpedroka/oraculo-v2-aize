create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.email))
  on conflict (id) do update
    set full_name = excluded.full_name;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.user_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select org_id from public.memberships where user_id = auth.uid()
$$;

create or replace function public.is_org_member(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships
    where user_id = auth.uid()
      and org_id = target_org
  )
$$;

create or replace function public.is_owner(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships
    where user_id = auth.uid()
      and org_id = target_org
      and role = 'owner'
  )
$$;

create or replace function public.user_area_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select a.id
  from public.areas a
  join public.memberships m on m.id = a.coordinator_id
  where m.user_id = auth.uid()
$$;

create or replace function public.can_write_area(target_org uuid, target_area uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_owner(target_org)
    or (
      target_area is not null
      and target_org in (select public.user_org_ids())
      and target_area in (select public.user_area_ids())
    )
$$;

create or replace function public.can_write_objective(target_org uuid, target_objective uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.objectives o
    where o.id = target_objective
      and o.org_id = target_org
      and public.can_write_area(o.org_id, o.area_id)
  )
$$;

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.areas enable row level security;
alter table public.strategic_plans enable row level security;
alter table public.area_plans enable row level security;
alter table public.objectives enable row level security;
alter table public.key_actions enable row level security;
alter table public.strategic_projects enable row level security;
alter table public.evidences enable row level security;
alter table public.chat_messages enable row level security;
alter table public.check_ins enable row level security;
alter table public.ai_settings enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

create policy profiles_read_self_or_org_members
on public.profiles for select
to authenticated
using (
  id = auth.uid()
  or exists (
    select 1
    from public.memberships own_membership
    join public.memberships visible_membership
      on visible_membership.org_id = own_membership.org_id
    where own_membership.user_id = auth.uid()
      and visible_membership.user_id = profiles.id
  )
);

create policy profiles_update_self
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy organizations_read_member
on public.organizations for select
to authenticated
using (public.is_org_member(id));

create policy organizations_insert_authenticated
on public.organizations for insert
to authenticated
with check (created_by = auth.uid());

create policy organizations_update_owner
on public.organizations for update
to authenticated
using (public.is_owner(id))
with check (public.is_owner(id));

create policy organizations_delete_owner
on public.organizations for delete
to authenticated
using (public.is_owner(id));

create policy memberships_read_org_member
on public.memberships for select
to authenticated
using (public.is_org_member(org_id));

create policy memberships_insert_initial_owner
on public.memberships for insert
to authenticated
with check (
  role = 'owner'
  and user_id = auth.uid()
  and exists (
    select 1 from public.organizations
    where organizations.id = memberships.org_id
      and organizations.created_by = auth.uid()
  )
);

create policy memberships_insert_owner
on public.memberships for insert
to authenticated
with check (public.is_owner(org_id));

create policy memberships_update_owner
on public.memberships for update
to authenticated
using (public.is_owner(org_id))
with check (public.is_owner(org_id));

create policy memberships_delete_owner
on public.memberships for delete
to authenticated
using (public.is_owner(org_id));

create policy areas_read_org_member
on public.areas for select
to authenticated
using (public.is_org_member(org_id));

create policy areas_write_owner
on public.areas for all
to authenticated
using (public.is_owner(org_id))
with check (public.is_owner(org_id));

create policy strategic_plans_read_org_member
on public.strategic_plans for select
to authenticated
using (public.is_org_member(org_id));

create policy strategic_plans_write_owner
on public.strategic_plans for all
to authenticated
using (public.is_owner(org_id))
with check (public.is_owner(org_id));

create policy area_plans_read_org_member
on public.area_plans for select
to authenticated
using (public.is_org_member(org_id));

create policy area_plans_write_owner
on public.area_plans for all
to authenticated
using (public.is_owner(org_id))
with check (public.is_owner(org_id));

create policy area_plans_write_coordinator
on public.area_plans for all
to authenticated
using (public.can_write_area(org_id, area_id))
with check (public.can_write_area(org_id, area_id));

create policy objectives_read_org_member
on public.objectives for select
to authenticated
using (public.is_org_member(org_id));

create policy objectives_write_owner
on public.objectives for all
to authenticated
using (public.is_owner(org_id))
with check (public.is_owner(org_id));

create policy objectives_write_coordinator
on public.objectives for all
to authenticated
using (public.can_write_area(org_id, area_id))
with check (public.can_write_area(org_id, area_id));

create policy key_actions_read_org_member
on public.key_actions for select
to authenticated
using (public.is_org_member(org_id));

create policy key_actions_write_owner
on public.key_actions for all
to authenticated
using (public.is_owner(org_id))
with check (public.is_owner(org_id));

create policy key_actions_write_objective_coordinator
on public.key_actions for all
to authenticated
using (public.can_write_objective(org_id, objective_id))
with check (public.can_write_objective(org_id, objective_id));

create policy strategic_projects_read_org_member
on public.strategic_projects for select
to authenticated
using (public.is_org_member(org_id));

create policy strategic_projects_write_owner
on public.strategic_projects for all
to authenticated
using (public.is_owner(org_id))
with check (public.is_owner(org_id));

create policy evidences_read_org_member
on public.evidences for select
to authenticated
using (public.is_org_member(org_id));

create policy evidences_write_owner
on public.evidences for all
to authenticated
using (public.is_owner(org_id))
with check (public.is_owner(org_id));

create policy evidences_write_objective_coordinator
on public.evidences for all
to authenticated
using (public.can_write_objective(org_id, objective_id))
with check (public.can_write_objective(org_id, objective_id));

create policy chat_messages_read_org_member
on public.chat_messages for select
to authenticated
using (public.is_org_member(org_id));

create policy chat_messages_write_owner
on public.chat_messages for all
to authenticated
using (public.is_owner(org_id))
with check (public.is_owner(org_id));

create policy chat_messages_write_coordinator
on public.chat_messages for all
to authenticated
using (public.can_write_area(org_id, area_id))
with check (public.can_write_area(org_id, area_id));

create policy check_ins_read_org_member
on public.check_ins for select
to authenticated
using (public.is_org_member(org_id));

create policy check_ins_write_owner
on public.check_ins for all
to authenticated
using (public.is_owner(org_id))
with check (public.is_owner(org_id));

create policy check_ins_write_coordinator
on public.check_ins for all
to authenticated
using (public.can_write_area(org_id, area_id))
with check (public.can_write_area(org_id, area_id));

create policy ai_settings_read_org_member
on public.ai_settings for select
to authenticated
using (public.is_org_member(org_id));

create policy ai_settings_write_owner
on public.ai_settings for all
to authenticated
using (public.is_owner(org_id))
with check (public.is_owner(org_id));
