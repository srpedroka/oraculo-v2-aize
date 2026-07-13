import { supabase } from "../../lib/supabase";
import type { OperationalHealthStatus } from "./types";

export async function loadOperationalHealth(orgId: string) {
  if (!supabase) throw new Error("Supabase não configurado.");
  const { data, error } = await supabase.functions.invoke("operational-health", { body: { action: "status", orgId } });
  if (error) {
    const response = (error as { context?: unknown })?.context;
    if (response instanceof Response) {
      const body = await response.clone().json().catch(() => null) as { error?: string; requestId?: string } | null;
      if (body?.error) throw new Error(`${body.error}${body.requestId ? ` · ${body.requestId}` : ""}`);
    }
    throw error;
  }
  if (data?.error) throw new Error(String(data.error));
  return data as OperationalHealthStatus;
}

