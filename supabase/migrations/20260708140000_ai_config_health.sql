alter table public.ai_function_settings
  add column if not exists last_status text
    check (last_status in ('ok', 'invalid_key', 'unknown_model', 'rate_limited', 'provider_error', 'timeout', 'no_key', 'untested')),
  add column if not exists last_status_detail text,
  add column if not exists last_status_source text
    check (last_status_source in ('save', 'manual', 'runtime')),
  add column if not exists last_checked_at timestamptz;

alter table public.ai_provider_key_status
  add column if not exists last_status text
    check (last_status in ('ok', 'invalid_key', 'unknown_model', 'rate_limited', 'provider_error', 'timeout', 'no_key', 'untested')),
  add column if not exists last_status_detail text,
  add column if not exists last_checked_at timestamptz;
