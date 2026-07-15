import { supabase } from "../../lib/supabase";
import type { OperationalHealthStatus, RecoveryIncident } from "./types";

async function invokeOperationalHealth<T>(body: Record<string, unknown>) {
  if (!supabase) throw new Error("Supabase não configurado.");
  const { data, error } = await supabase.functions.invoke("operational-health", { body });
  if (error) {
    const response = (error as { context?: unknown })?.context;
    if (response instanceof Response) {
      const body = await response.clone().json().catch(() => null) as { error?: string; requestId?: string } | null;
      if (body?.error) throw new Error(`${body.error}${body.requestId ? ` · ${body.requestId}` : ""}`);
    }
    throw error;
  }
  if (data?.error) throw new Error(String(data.error));
  return data as T;
}

export function loadOperationalHealth(orgId: string) {
  return invokeOperationalHealth<OperationalHealthStatus>({ action: "status", orgId });
}

export function openRecoveryIncident(
  orgId: string,
  input: {
    incidentType: RecoveryIncident["incident_type"];
    severity: RecoveryIncident["severity"];
    affectedServices: RecoveryIncident["affected_services"];
  },
) {
  return invokeOperationalHealth<{ ok: true; incident: RecoveryIncident }>({
    action: "incident_open",
    orgId,
    ...input,
  });
}

export function resolveRecoveryIncident(orgId: string, incidentId: string) {
  return invokeOperationalHealth<{ ok: true }>({ action: "incident_resolve", orgId, incidentId });
}
