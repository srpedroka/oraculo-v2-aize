alter table public.whatsapp_settings
  alter column inbound_queue_enabled set default true,
  alter column outbound_outbox_enabled set default true;

update public.whatsapp_settings
set inbound_queue_enabled = true,
    outbound_outbox_enabled = true,
    updated_at = now()
where enabled = true
  and (inbound_queue_enabled = false or outbound_outbox_enabled = false);

comment on column public.whatsapp_settings.inbound_queue_enabled is
  'Caminho durável obrigatório para texto quando o WhatsApp está ativo. False funciona apenas como kill switch; não existe fallback síncrono de texto.';

comment on column public.whatsapp_settings.outbound_outbox_enabled is
  'Outbox obrigatória para respostas textuais quando o WhatsApp está ativo. Envios de mídia continuam como exceção direta e auditada.';
