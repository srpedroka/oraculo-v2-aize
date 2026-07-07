alter table public.plan_documents
  add column if not exists origin text not null default 'session';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.plan_documents'::regclass
      and conname = 'plan_documents_origin_check'
  ) then
    alter table public.plan_documents
      add constraint plan_documents_origin_check
      check (origin in ('session', 'historical'));
  end if;
end $$;

create index if not exists idx_plan_documents_origin
on public.plan_documents (org_id, origin, period);
