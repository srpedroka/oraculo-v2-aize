do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.planning_sessions'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%type%'
  loop
    execute format('alter table public.planning_sessions drop constraint %I', constraint_name);
  end loop;

  alter table public.planning_sessions
    add constraint planning_sessions_type_check
    check (type in ('strategic', 'quarterly', 'monthly', 'month_close', 'quarter_close', 'strategic_review'));
end $$;

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
    check (type in ('strategic', 'quarterly', 'monthly', 'month_close', 'quarter_close', 'strategic_review'));
end $$;
