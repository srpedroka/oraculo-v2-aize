import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";

export function env(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} não configurado`);
  return value;
}

export function serviceClient() {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
}

export async function getUser(req: Request) {
  const authorization = req.headers.get("Authorization");
  if (!authorization) throw new Error("Sessão ausente");

  const client = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    auth: { persistSession: false },
    global: { headers: { Authorization: authorization } },
  });

  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error("Sessão inválida");
  return data.user;
}

export async function assertOrgMember(userId: string, orgId: string) {
  const client = serviceClient();
  const { data, error } = await client
    .from("memberships")
    .select("id, role")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Sem acesso à empresa");
  return data as { id: string; role: "owner" | "coordinator" };
}

export async function assertOwner(userId: string, orgId: string) {
  const membership = await assertOrgMember(userId, orgId);
  if (membership.role !== "owner") throw new Error("Apenas o dono da empresa pode executar esta ação");
  return membership;
}

export async function assertAreaWriter(userId: string, orgId: string, areaId: string | null) {
  const client = serviceClient();
  const membership = await assertOrgMember(userId, orgId);
  if (membership.role === "owner") return membership;
  if (!areaId) throw new Error("Coordenador só pode alterar a própria área");

  const { data, error } = await client
    .from("areas")
    .select("id")
    .eq("id", areaId)
    .eq("org_id", orgId)
    .eq("coordinator_id", membership.id)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Coordenador só pode alterar a própria área");
  return membership;
}
