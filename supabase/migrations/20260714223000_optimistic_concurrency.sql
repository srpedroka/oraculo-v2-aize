-- Optimistic concurrency for the first high-value editing surfaces.

alter table public.objectives
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by uuid references public.profiles(id) on delete set null;

alter table public.executive_kpis
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by uuid references public.profiles(id) on delete set null;

create or replace function public.touch_versioned_record()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := clock_timestamp();
  if auth.uid() is not null then
    new.updated_by := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists objectives_touch_version on public.objectives;
create trigger objectives_touch_version
before update on public.objectives
for each row execute function public.touch_versioned_record();

drop trigger if exists executive_kpis_touch_version on public.executive_kpis;

drop function if exists public.save_kpi_editor_if_current(uuid, uuid, int, timestamptz, numeric, numeric, jsonb);

create or replace function public.save_kpi_editor_if_current(
  p_org_id uuid,
  p_kpi_id uuid,
  p_year int,
  p_expected_kpi_updated_at timestamptz,
  p_annual_target numeric,
  p_opening_balance numeric,
  p_months int[],
  p_expected_month_updated_at timestamptz[],
  p_target_values numeric[],
  p_target_stages text[],
  p_actual_values numeric[],
  p_secondary_actuals numeric[],
  p_notes text[]
)
returns jsonb
language sql
security invoker
set search_path = public
as $$
with input_rows as materialized (
  select
    item_index,
    p_months[item_index] as month,
    p_expected_month_updated_at[item_index] as expected_updated_at,
    p_target_values[item_index] as target_value,
    p_target_stages[item_index] as target_stage,
    p_actual_values[item_index] as actual_value,
    p_secondary_actuals[item_index] as secondary_actual,
    p_notes[item_index] as note
  from generate_subscripts(p_months, 1) item_index
),
input_validation as (
  select
    p_year between 2000 and 2100
    and cardinality(p_months) between 1 and 12
    and cardinality(p_expected_month_updated_at) = cardinality(p_months)
    and cardinality(p_target_values) = cardinality(p_months)
    and cardinality(p_target_stages) = cardinality(p_months)
    and cardinality(p_actual_values) = cardinality(p_months)
    and cardinality(p_secondary_actuals) = cardinality(p_months)
    and cardinality(p_notes) = cardinality(p_months)
    and not exists (select 1 from input_rows where month < 1 or month > 12)
    and (select count(distinct month) from input_rows) = cardinality(p_months)
    as valid
),
month_conflicts as (
  select 1
  from input_rows input
  left join public.kpi_monthly_values current_value
    on current_value.org_id = p_org_id
    and current_value.kpi_id = p_kpi_id
    and current_value.year = p_year
    and current_value.month = input.month
  where (
    current_value.id is not null
    and (
      input.expected_updated_at is null
      or current_value.updated_at is distinct from input.expected_updated_at
    )
  ) or (
    current_value.id is null
    and input.expected_updated_at is not null
  )
),
updated_kpi as (
  update public.executive_kpis current_kpi
  set annual_target = p_annual_target,
      opening_balance = p_opening_balance,
      updated_at = clock_timestamp(),
      updated_by = auth.uid()
  from input_validation validation
  where current_kpi.id = p_kpi_id
    and current_kpi.org_id = p_org_id
    and current_kpi.updated_at is not distinct from p_expected_kpi_updated_at
    and public.is_admin(p_org_id)
    and validation.valid
    and not exists (select 1 from month_conflicts)
  returning current_kpi.id
),
upserted_months as (
  insert into public.kpi_monthly_values (
    org_id, kpi_id, year, month, target_value, target_stage,
    actual_value, secondary_actual, note, updated_by, updated_at
  )
  select
    p_org_id,
    p_kpi_id,
    p_year,
    input.month,
    input.target_value,
    nullif(input.target_stage, ''),
    input.actual_value,
    input.secondary_actual,
    nullif(input.note, ''),
    auth.uid(),
    clock_timestamp()
  from input_rows input
  where exists (select 1 from updated_kpi)
  on conflict (kpi_id, year, month) do update set
    target_value = excluded.target_value,
    target_stage = excluded.target_stage,
    actual_value = excluded.actual_value,
    secondary_actual = excluded.secondary_actual,
    note = excluded.note,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at
  returning id
)
select jsonb_build_object(
  'ok', exists (select 1 from updated_kpi)
    and (select count(*) from upserted_months) = cardinality(p_months),
  'conflict', not exists (select 1 from updated_kpi),
  'invalid', not (select valid from input_validation)
);
$$;

revoke all on function public.save_kpi_editor_if_current(uuid, uuid, int, timestamptz, numeric, numeric, int[], timestamptz[], numeric[], text[], numeric[], numeric[], text[]) from public, anon;
grant execute on function public.save_kpi_editor_if_current(uuid, uuid, int, timestamptz, numeric, numeric, int[], timestamptz[], numeric[], text[], numeric[], numeric[], text[]) to authenticated, service_role;

create or replace function public.save_whatsapp_settings_if_current(
  p_org_id uuid,
  p_expected_updated_at timestamptz,
  p_instance_url text,
  p_instance_name text,
  p_connected_number text,
  p_enabled boolean,
  p_weekly_pulse_enabled boolean,
  p_weekly_pulse_weekday int,
  p_weekly_pulse_hour int,
  p_api_key text,
  p_webhook_secret text,
  p_key_preview text,
  p_webhook_secret_preview text
)
returns jsonb
language sql
security invoker
set search_path = public
as $$
with saved_settings as (
  insert into public.whatsapp_settings (
    org_id, instance_url, instance_name, connected_number, enabled,
    inbound_queue_enabled, outbound_outbox_enabled, has_api_key, key_preview,
    has_webhook_secret, webhook_secret_preview, weekly_pulse_enabled,
    weekly_pulse_weekday, weekly_pulse_hour, updated_at
  )
  select
    p_org_id,
    nullif(p_instance_url, ''),
    nullif(p_instance_name, ''),
    nullif(p_connected_number, ''),
    p_enabled,
    p_enabled,
    p_enabled,
    coalesce(current_settings.has_api_key, false) or nullif(p_api_key, '') is not null,
    case when nullif(p_api_key, '') is not null then p_key_preview else current_settings.key_preview end,
    coalesce(current_settings.has_webhook_secret, false) or nullif(p_webhook_secret, '') is not null,
    case when nullif(p_webhook_secret, '') is not null then p_webhook_secret_preview else current_settings.webhook_secret_preview end,
    p_weekly_pulse_enabled,
    p_weekly_pulse_weekday,
    p_weekly_pulse_hour,
    clock_timestamp()
  from (select 1) seed
  left join public.whatsapp_settings current_settings on current_settings.org_id = p_org_id
  where (
    current_settings.org_id is null and p_expected_updated_at is null
  ) or (
    current_settings.org_id is not null
    and current_settings.updated_at is not distinct from p_expected_updated_at
  )
  on conflict (org_id) do update set
    instance_url = excluded.instance_url,
    instance_name = excluded.instance_name,
    connected_number = excluded.connected_number,
    enabled = excluded.enabled,
    inbound_queue_enabled = excluded.inbound_queue_enabled,
    outbound_outbox_enabled = excluded.outbound_outbox_enabled,
    has_api_key = excluded.has_api_key,
    key_preview = excluded.key_preview,
    has_webhook_secret = excluded.has_webhook_secret,
    webhook_secret_preview = excluded.webhook_secret_preview,
    weekly_pulse_enabled = excluded.weekly_pulse_enabled,
    weekly_pulse_weekday = excluded.weekly_pulse_weekday,
    weekly_pulse_hour = excluded.weekly_pulse_hour,
    updated_at = excluded.updated_at
  where public.whatsapp_settings.updated_at is not distinct from p_expected_updated_at
  returning updated_at
),
saved_secret as (
  insert into public.whatsapp_instance_keys (org_id, api_key, webhook_secret, updated_at)
  select p_org_id, nullif(p_api_key, ''), nullif(p_webhook_secret, ''), clock_timestamp()
  where exists (select 1 from saved_settings)
    and (nullif(p_api_key, '') is not null or nullif(p_webhook_secret, '') is not null)
  on conflict (org_id) do update set
    api_key = coalesce(excluded.api_key, public.whatsapp_instance_keys.api_key),
    webhook_secret = coalesce(excluded.webhook_secret, public.whatsapp_instance_keys.webhook_secret),
    updated_at = excluded.updated_at
  returning org_id
)
select jsonb_build_object(
  'ok', exists (select 1 from saved_settings),
  'conflict', not exists (select 1 from saved_settings),
  'updatedAt', (select updated_at from saved_settings),
  'secretUpdated', exists (select 1 from saved_secret)
);
$$;

revoke all on function public.save_whatsapp_settings_if_current(uuid, timestamptz, text, text, text, boolean, boolean, int, int, text, text, text, text) from public, anon, authenticated;
grant execute on function public.save_whatsapp_settings_if_current(uuid, timestamptz, text, text, text, boolean, boolean, int, int, text, text, text, text) to service_role;

create or replace function public.save_ai_function_if_current(
  p_org_id uuid,
  p_function text,
  p_expected_updated_at timestamptz,
  p_provider text,
  p_model text
)
returns jsonb
language sql
security invoker
set search_path = public
as $$
with saved_setting as (
  insert into public.ai_function_settings (org_id, function, provider, model, updated_at)
  select p_org_id, p_function, p_provider, p_model, clock_timestamp()
  where p_expected_updated_at is null
    or exists (
      select 1 from public.ai_function_settings current_setting
      where current_setting.org_id = p_org_id
        and current_setting.function = p_function
        and current_setting.updated_at is not distinct from p_expected_updated_at
    )
  on conflict (org_id, function) do update set
    provider = excluded.provider,
    model = excluded.model,
    updated_at = excluded.updated_at
  where public.ai_function_settings.updated_at is not distinct from p_expected_updated_at
  returning updated_at
)
select jsonb_build_object(
  'ok', exists (select 1 from saved_setting),
  'conflict', not exists (select 1 from saved_setting),
  'updatedAt', (select updated_at from saved_setting)
);
$$;

revoke all on function public.save_ai_function_if_current(uuid, text, timestamptz, text, text) from public, anon, authenticated;
grant execute on function public.save_ai_function_if_current(uuid, text, timestamptz, text, text) to service_role;

create index if not exists objectives_version_lookup_idx
on public.objectives (org_id, id, updated_at);

create index if not exists executive_kpis_version_lookup_idx
on public.executive_kpis (org_id, id, updated_at);

select public.record_destructive_schema_change(
  array['20260714223000_optimistic_concurrency.sql']::text[]
);
