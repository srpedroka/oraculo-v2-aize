import { supabase } from "../../lib/supabase";
import type {
  OrganizationBackupState,
  RestoreOrganizationResult,
} from "./types";

const functionUrl = `${String(import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/+$/, "")}/functions/v1/organization-backup`;
const anonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? "");

async function edgeError(error: any) {
  const response = error?.context as Response | undefined;
  if (response) {
    try {
      const body = await response.clone().json();
      if (body?.error) return String(body.error);
    } catch {
      // Keep the SDK error below when the response has no JSON body.
    }
  }
  return error instanceof Error ? error.message : "Falha ao chamar o serviço de backup.";
}

async function invokeBackup<T>(body: Record<string, unknown>) {
  if (!supabase) throw new Error("Supabase não configurado.");
  const { data, error } = await supabase.functions.invoke("organization-backup", { body });
  if (error) throw new Error(await edgeError(error));
  return data as T;
}

export function loadBackupState(orgId: string) {
  return invokeBackup<OrganizationBackupState>({ action: "list", orgId });
}

export function createBackupNow(orgId: string) {
  return invokeBackup<{ ok: true }>({ action: "create", orgId });
}

export function updateBackupPolicy(
  orgId: string,
  policy: {
    automaticEnabled: boolean;
    eventSnapshotsEnabled: boolean;
    eventRetentionDays: number;
    dailyRetentionDays: number;
    weeklyRetentionDays: number;
    monthlyRetentionDays: number;
  },
) {
  return invokeBackup<{ ok: true }>({ action: "update_policy", orgId, policy });
}

export function restoreStoredBackup(orgId: string, backupId: string) {
  return invokeBackup<RestoreOrganizationResult>({ action: "restore", orgId, backupId });
}

export function runRecoveryDrill(orgId: string, exerciseType: "monthly_drill" | "disaster_drill") {
  return invokeBackup<RestoreOrganizationResult>({ action: "drill", orgId, exerciseType });
}

export function discardRecoveryDrill(orgId: string, restoreRunId: string) {
  return invokeBackup<{ ok: true }>({ action: "discard_drill", orgId, restoreRunId });
}

export function restorePortableBackup(orgId: string | null, envelope: unknown) {
  return invokeBackup<RestoreOrganizationResult>({ action: "restore", ...(orgId ? { orgId } : {}), envelope });
}

export function deleteStoredBackup(orgId: string, backupId: string) {
  return invokeBackup<{ ok: true }>({ action: "delete", orgId, backupId });
}

export async function downloadBackupEnvelope(orgId: string, backupId: string) {
  if (!supabase) throw new Error("Supabase não configurado.");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sessão expirada.");
  const response = await fetch(functionUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "download", orgId, backupId }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? "Não foi possível baixar o pacote.");
  }
  return response.text();
}
