create or replace function public.refresh_ai_budget_events(p_org_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  budget numeric(12, 2) := 100;
  mode text := 'monitor';
  month_cost numeric(16, 8) := 0;
  month_key text := to_char(date_trunc('month', now()), 'YYYY-MM');
  threshold integer;
begin
  select monthly_budget_usd, enforcement_mode
  into budget, mode
  from public.ai_control_policies
  where org_id = p_org_id;

  if not found then
    budget := 100;
    mode := 'monitor';
  end if;

  select coalesce(sum(total_cost_usd), 0)
  into month_cost
  from public.ai_usage_logs
  where org_id = p_org_id and created_at >= date_trunc('month', now());

  foreach threshold in array array[70, 90, 100] loop
    if month_cost >= budget * threshold / 100.0 then
      insert into public.ai_limit_events (
        org_id, kind, scope_key, period_key, threshold_percent,
        observed_value, limit_value, enforcement_mode, blocked
      ) values (
        p_org_id, 'monthly_budget', 'org', month_key, threshold,
        month_cost, budget, mode, false
      ) on conflict do nothing;
    end if;
  end loop;

  return jsonb_build_object('monthlyCostUsd', month_cost, 'monthlyBudgetUsd', budget);
end;
$$;

revoke all on function public.refresh_ai_budget_events(uuid) from public, anon, authenticated;
grant execute on function public.refresh_ai_budget_events(uuid) to service_role;

