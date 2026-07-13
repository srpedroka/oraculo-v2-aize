create or replace function public.protect_whatsapp_inbound_queue_flag()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user <> 'service_role' then
    if (tg_op = 'INSERT' and new.inbound_queue_enabled = true)
      or (tg_op = 'UPDATE' and new.inbound_queue_enabled is distinct from old.inbound_queue_enabled) then
      raise exception 'A fila de entrada do WhatsApp só pode ser alterada pelo serviço';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.protect_whatsapp_inbound_queue_flag() from public, anon, authenticated;
