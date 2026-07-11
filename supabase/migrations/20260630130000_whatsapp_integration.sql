alter table public.chat_messages
  add column if not exists channel text not null default 'web';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'chat_messages_channel_check'
  ) then
    alter table public.chat_messages
      add constraint chat_messages_channel_check
      check (channel in ('web', 'whatsapp'));
  end if;
end
$$;

create table if not exists public.whatsapp_settings (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  instance_url text,
  instance_name text,
  connected_number text,
  enabled boolean not null default false,
  has_api_key boolean not null default false,
  key_preview text,
  has_webhook_secret boolean not null default false,
  webhook_secret_preview text,
  updated_at timestamptz not null default now()
);

create table if not exists private.whatsapp_instance_keys (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  api_key text,
  webhook_secret text,
  updated_at timestamptz not null default now()
);

alter table public.whatsapp_settings enable row level security;

grant select, insert, update, delete on public.whatsapp_settings to authenticated;

create policy whatsapp_settings_read_org_member
on public.whatsapp_settings for select
to authenticated
using (public.is_org_member(org_id));

create policy whatsapp_settings_write_owner
on public.whatsapp_settings for all
to authenticated
using (public.is_owner(org_id))
with check (public.is_owner(org_id));

revoke all on private.whatsapp_instance_keys from anon, authenticated;
