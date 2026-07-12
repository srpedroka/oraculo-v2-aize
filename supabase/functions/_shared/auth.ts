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

export class MfaRequiredError extends Error {
  readonly code = "MFA_REQUIRED";

  constructor() {
    super("Confirme o código do autenticador em Configurações > Segurança e tente novamente");
    this.name = "MfaRequiredError";
  }
}

function bearerToken(req: Request) {
  const authorization = req.headers.get("Authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) throw new Error("Sessão ausente");
  return match[1];
}

export async function requestAal(req: Request) {
  const token = bearerToken(req);
  const client = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    auth: { persistSession: false },
  });
  const { data, error } = await client.auth.mfa.getAuthenticatorAssuranceLevel(token);
  if (error) throw new Error("Sessão inválida");
  return data.currentLevel;
}

export async function assertAal2(req: Request) {
  if (await requestAal(req) !== "aal2") throw new MfaRequiredError();
}

export async function assertCriticalActionAal2(req: Request, orgId: string) {
  const client = serviceClient();
  const { data, error } = await client
    .from("organization_security_settings")
    .select("require_mfa_for_critical_actions")
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw error;
  if (data?.require_mfa_for_critical_actions) await assertAal2(req);
}

export function isMfaRequiredError(error: unknown): error is MfaRequiredError {
  return error instanceof MfaRequiredError;
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
  return data as { id: string; role: "owner" | "admin" | "coordinator" };
}

export async function assertOwner(userId: string, orgId: string) {
  const membership = await assertOrgMember(userId, orgId);
  if (membership.role !== "owner") throw new Error("Apenas o dono da empresa pode executar esta ação");
  return membership;
}

export async function assertAreaWriter(userId: string, orgId: string, areaId: string | null) {
  const client = serviceClient();
  const membership = await assertOrgMember(userId, orgId);
  if (!areaId) {
    if (membership.role === "owner") return membership;
    throw new Error("Coordenador só pode alterar a própria área");
  }

  const { data, error } = await client
    .from("areas")
    .select("id, coordinator_id")
    .eq("id", areaId)
    .eq("org_id", orgId)
    .is("archived_at", null)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Área arquivada ou não encontrada");
  if (membership.role !== "owner" && data.coordinator_id !== membership.id) {
    throw new Error("Coordenador só pode alterar a própria área");
  }
  return membership;
}
