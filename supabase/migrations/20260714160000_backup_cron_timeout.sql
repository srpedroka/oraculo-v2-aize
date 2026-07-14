create or replace function public.invoke_organization_backup_cron()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  request_id bigint;
  secret_value text;
begin
  select cron_secret into strict secret_value
  from public.organization_backup_secrets
  where id = 'cron';

  select net.http_post(
    url := 'https://bkswkfazkjilwfzwzthz.supabase.co/functions/v1/organization-backup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-oraculo-backup-cron-secret', secret_value
    ),
    body := jsonb_build_object('action', 'cron'),
    timeout_milliseconds := 300000
  ) into request_id;

  return request_id;
end
$$;

revoke all on function public.invoke_organization_backup_cron() from public, anon, authenticated;
grant execute on function public.invoke_organization_backup_cron() to postgres, service_role;
