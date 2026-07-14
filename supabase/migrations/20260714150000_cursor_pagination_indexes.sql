-- Keyset pagination for growing operational histories. These indexes only
-- support existing member-scoped SELECT policies; RLS and grants are unchanged.
create index if not exists plan_documents_org_archive_cursor_idx
on public.plan_documents (org_id, archived_at, created_at desc, id desc);

create index if not exists plan_documents_org_filters_cursor_idx
on public.plan_documents (org_id, archived_at, type, area_id, period, created_at desc, id desc);

create index if not exists evidences_org_objective_cursor_idx
on public.evidences (org_id, archived_at, objective_id, created_at desc, id desc);

create index if not exists check_ins_org_period_cursor_idx
on public.check_ins (org_id, archived_at, area_id, period, created_at desc, id desc);

create index if not exists ai_usage_logs_org_cursor_idx
on public.ai_usage_logs (org_id, created_at desc, id desc);

create index if not exists operational_revisions_org_cursor_idx
on public.operational_revisions (org_id, created_at desc, id desc);
