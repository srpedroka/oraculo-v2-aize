do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.plan_documents'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%type%'
  loop
    execute format('alter table public.plan_documents drop constraint %I', constraint_name);
  end loop;

  alter table public.plan_documents
    add constraint plan_documents_type_check
    check (type in ('strategic', 'quarterly', 'monthly', 'month_close', 'quarter_close', 'strategic_review', 'kpi_history'));
end $$;

create index if not exists idx_plan_documents_kpi_history
on public.plan_documents (org_id, period, created_at desc)
where type = 'kpi_history' and origin = 'historical';
