import { supabase } from "../../lib/supabase";
import { DATA_NOTICE_VERSION } from "./data-notice";

export interface DataNoticeAcknowledgement {
  orgId: string;
  noticeVersion: string;
  acceptedBy: string | null;
  acceptedAt: string;
}

export async function loadDataNoticeAcknowledgement(orgId: string) {
  if (!supabase) throw new Error("Supabase não configurado.");
  const { data, error } = await supabase
    .from("organization_data_notice_acknowledgements")
    .select("org_id, notice_version, accepted_by, accepted_at")
    .eq("org_id", orgId)
    .eq("notice_version", DATA_NOTICE_VERSION)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    orgId: data.org_id,
    noticeVersion: data.notice_version,
    acceptedBy: data.accepted_by,
    acceptedAt: data.accepted_at,
  } satisfies DataNoticeAcknowledgement;
}

export async function acknowledgeDataNotice(orgId: string) {
  if (!supabase) throw new Error("Supabase não configurado.");
  const { data, error } = await supabase
    .from("organization_data_notice_acknowledgements")
    .insert({ org_id: orgId, notice_version: DATA_NOTICE_VERSION })
    .select("org_id, notice_version, accepted_by, accepted_at")
    .single();
  if (error) throw error;
  return {
    orgId: data.org_id,
    noticeVersion: data.notice_version,
    acceptedBy: data.accepted_by,
    acceptedAt: data.accepted_at,
  } satisfies DataNoticeAcknowledgement;
}
