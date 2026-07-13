create table public.ai_control_policies (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  person_calls_per_minute integer not null default 10 check (person_calls_per_minute between 1 and 300),
  org_calls_per_minute integer not null default 60 check (org_calls_per_minute between 1 and 3000),
  monthly_budget_usd numeric(12, 2) not null default 100 check (monthly_budget_usd between 1 and 1000000),
  enforcement_mode text not null default 'monitor' check (enforcement_mode in ('monitor', 'block')),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.ai_call_counters (
  org_id uuid not null references public.organizations(id) on delete cascade,
  scope text not null check (scope in ('org', 'user')),
  scope_key text not null,
  window_start timestamptz not null,
  call_count integer not null default 0 check (call_count >= 0),
  primary key (org_id, scope, scope_key, window_start)
);

create index ai_call_counters_cleanup_idx on public.ai_call_counters (window_start);

create table public.ai_limit_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  kind text not null check (kind in ('person_rate', 'org_rate', 'monthly_budget')),
  scope_key text not null,
  period_key text not null,
  threshold_percent integer not null default 100 check (threshold_percent between 1 and 100),
  observed_value numeric(16, 6) not null,
  limit_value numeric(16, 6) not null,
  enforcement_mode text not null check (enforcement_mode in ('monitor', 'block')),
  blocked boolean not null default false,
  created_at timestamptz not null default now(),
  unique (org_id, kind, scope_key, period_key, threshold_percent)
);

create index ai_limit_events_org_created_idx on public.ai_limit_events (org_id, created_at desc);

alter table public.ai_control_policies enable row level security;
alter table public.ai_call_counters enable row level security;
alter table public.ai_limit_events enable row level security;

revoke all on public.ai_control_policies, public.ai_call_counters, public.ai_limit_events from anon, authenticated;
grant select on public.ai_control_policies to authenticated;
grant select on public.ai_limit_events to authenticated;

create policy ai_control_policies_read_member
on public.ai_control_policies for select
to authenticated
using (public.is_org_member(org_id));

create policy ai_limit_events_read_owner
on public.ai_limit_events for select
to authenticated
using (public.is_owner(org_id));

create or replace view public.ai_monthly_usage
with (security_invoker = true)
as
select
  org_id,
  date_trunc('month', created_at) as month_start,
  count(*)::integer as calls,
  coalesce(sum(total_tokens), 0)::bigint as total_tokens,
  coalesce(sum(total_cost_usd), 0)::numeric(16, 8) as total_cost_usd
from public.ai_usage_logs
group by org_id, date_trunc('month', created_at);

grant select on public.ai_monthly_usage to authenticated;

create or replace function public.evaluate_ai_call_controls(
  p_org_id uuid,
  p_user_id uuid default null,
  p_allow_completion boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  policy_row public.ai_control_policies%rowtype;
  minute_start timestamptz := date_trunc('minute', now());
  month_start timestamptz := date_trunc('month', now());
  month_key text := to_char(date_trunc('month', now()), 'YYYY-MM');
  org_count integer;
  person_count integer := 0;
  month_cost numeric(16, 8) := 0;
  person_exceeded boolean := false;
  org_exceeded boolean := false;
  budget_exceeded boolean := false;
  should_block boolean := false;
  reason text := null;
  threshold integer;
begin
  select * into policy_row from public.ai_control_policies where org_id = p_org_id;
  if not found then
    policy_row.org_id := p_org_id;
    policy_row.person_calls_per_minute := 10;
    policy_row.org_calls_per_minute := 60;
    policy_row.monthly_budget_usd := 100;
    policy_row.enforcement_mode := 'monitor';
  end if;

  insert into public.ai_call_counters (org_id, scope, scope_key, window_start, call_count)
  values (p_org_id, 'org', 'org', minute_start, 1)
  on conflict (org_id, scope, scope_key, window_start)
  do update set call_count = public.ai_call_counters.call_count + 1
  returning call_count into org_count;

  if p_user_id is not null then
    insert into public.ai_call_counters (org_id, scope, scope_key, window_start, call_count)
    values (p_org_id, 'user', p_user_id::text, minute_start, 1)
    on conflict (org_id, scope, scope_key, window_start)
    do update set call_count = public.ai_call_counters.call_count + 1
    returning call_count into person_count;
  end if;

  select coalesce(sum(total_cost_usd), 0)
  into month_cost
  from public.ai_usage_logs
  where org_id = p_org_id and created_at >= month_start;

  person_exceeded := p_user_id is not null and person_count > policy_row.person_calls_per_minute;
  org_exceeded := org_count > policy_row.org_calls_per_minute;
  budget_exceeded := month_cost >= policy_row.monthly_budget_usd;

  should_block := policy_row.enforcement_mode = 'block'
    and not p_allow_completion
    and (person_exceeded or org_exceeded or budget_exceeded);

  if person_exceeded then
    reason := 'person_rate';
    insert into public.ai_limit_events (
      org_id, user_id, kind, scope_key, period_key, observed_value, limit_value, enforcement_mode, blocked
    ) values (
      p_org_id, p_user_id, 'person_rate', p_user_id::text, to_char(minute_start, 'YYYY-MM-DD"T"HH24:MI'),
      person_count, policy_row.person_calls_per_minute, policy_row.enforcement_mode, should_block
    ) on conflict do nothing;
  end if;

  if org_exceeded then
    reason := coalesce(reason, 'org_rate');
    insert into public.ai_limit_events (
      org_id, kind, scope_key, period_key, observed_value, limit_value, enforcement_mode, blocked
    ) values (
      p_org_id, 'org_rate', 'org', to_char(minute_start, 'YYYY-MM-DD"T"HH24:MI'),
      org_count, policy_row.org_calls_per_minute, policy_row.enforcement_mode, should_block
    ) on conflict do nothing;
  end if;

  foreach threshold in array array[70, 90, 100] loop
    if month_cost >= policy_row.monthly_budget_usd * threshold / 100.0 then
      insert into public.ai_limit_events (
        org_id, kind, scope_key, period_key, threshold_percent, observed_value, limit_value, enforcement_mode, blocked
      ) values (
        p_org_id, 'monthly_budget', 'org', month_key, threshold, month_cost,
        policy_row.monthly_budget_usd, policy_row.enforcement_mode,
        should_block and threshold = 100
      ) on conflict do nothing;
    end if;
  end loop;

  if budget_exceeded then reason := coalesce(reason, 'monthly_budget'); end if;

  delete from public.ai_call_counters where window_start < now() - interval '2 hours';

  return jsonb_build_object(
    'allowed', not should_block,
    'mode', policy_row.enforcement_mode,
    'reason', reason,
    'personCount', person_count,
    'personLimit', policy_row.person_calls_per_minute,
    'orgCount', org_count,
    'orgLimit', policy_row.org_calls_per_minute,
    'monthlyCostUsd', month_cost,
    'monthlyBudgetUsd', policy_row.monthly_budget_usd,
    'completionBypass', p_allow_completion and (person_exceeded or org_exceeded or budget_exceeded)
  );
end;
$$;

revoke all on function public.evaluate_ai_call_controls(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.evaluate_ai_call_controls(uuid, uuid, boolean) to service_role;

