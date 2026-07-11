alter table public.ai_usage_logs replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'ai_usage_logs'
  ) then
    alter publication supabase_realtime add table public.ai_usage_logs;
  end if;
end $$;
