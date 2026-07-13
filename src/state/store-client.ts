import { supabase } from "../lib/supabase";

export function requireClient() {
  if (!supabase) throw new Error("Supabase não configurado");
  return supabase;
}

export async function callEdgeFunction<TBody extends Record<string, unknown>>(name: string, body: TBody) {
  const client = requireClient();
  const { data, error } = await client.functions.invoke(name, { body });
  if (error) {
    const response = (error as { context?: unknown }).context;
    if (response instanceof Response) {
      let payload: { error?: unknown } | null = null;
      try {
        payload = await response.clone().json() as { error?: unknown };
      } catch {
        payload = null;
      }
      if (typeof payload?.error === "string" && payload.error.trim()) throw new Error(payload.error);
    }
    throw error;
  }
  if (data && typeof data === "object" && "error" in data && typeof data.error === "string") throw new Error(data.error);
  return data;
}
