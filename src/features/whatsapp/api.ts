import { supabase } from "../../lib/supabase";
import type { WhatsAppHealthStatus } from "./types";

async function edgeError(error: unknown) {
  const response = (error as { context?: unknown })?.context;
  if (response instanceof Response) {
    const body = await response.clone().json().catch(() => null) as { error?: unknown } | null;
    if (typeof body?.error === "string") return body.error;
  }
  return error instanceof Error ? error.message : "Não foi possível consultar o WhatsApp.";
}

async function invokeHealth<T>(body: Record<string, unknown>) {
  if (!supabase) throw new Error("Supabase não configurado.");
  const { data, error } = await supabase.functions.invoke("whatsapp-health", { body });
  if (error) throw new Error(await edgeError(error));
  if (data?.error) throw new Error(String(data.error));
  return data as T;
}

export function loadWhatsAppHealth(orgId: string) {
  return invokeHealth<WhatsAppHealthStatus>({ action: "status", orgId });
}

export function sendWhatsAppHealthTest(orgId: string) {
  return invokeHealth<{ ok: true; sentAt: string }>({ action: "send_test", orgId });
}

export function retryWhatsAppDeadItem(orgId: string, itemType: "inbound" | "outbound", itemId: string) {
  return invokeHealth<{ ok: true; requeued: true }>({ action: "retry", orgId, itemType, itemId });
}
