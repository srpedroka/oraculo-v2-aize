import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { assertAal2, getUser, isMfaRequiredError, serviceClient } from "../_shared/auth.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

type Action = "export" | "delete";
type DataRequestStatus = "completed" | "blocked" | "failed";

const PAGE_SIZE = 500;

class BlockedRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlockedRequestError";
  }
}

function asText(value: unknown, maxLength = 320) {
  return String(value ?? "").trim().slice(0, maxLength);
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function fetchAll(
  page: (from: number, to: number) => PromiseLike<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>,
) {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) return rows;
  }
}

async function createRequest(userId: string, fingerprint: string, requestType: "export" | "account_deletion") {
  const client = serviceClient();
  const { data, error } = await client
    .from("personal_data_requests")
    .insert({ user_id: userId, subject_fingerprint: fingerprint, request_type: requestType })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Não foi possível registrar a solicitação");
  return data.id as string;
}

async function finishRequest(requestId: string, status: DataRequestStatus, summary: Record<string, unknown>) {
  const { error } = await serviceClient()
    .from("personal_data_requests")
    .update({ status, result_summary: summary, completed_at: new Date().toISOString() })
    .eq("id", requestId);
  if (error) console.error("personal-account: falha ao finalizar trilha", error.message);
}

async function currentMemberships(userId: string) {
  return fetchAll((from, to) => serviceClient()
    .from("memberships")
    .select("id, org_id, user_id, role, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .range(from, to));
}

async function exportPersonalData(user: Awaited<ReturnType<typeof getUser>>, requestId: string) {
  const client = serviceClient();
  const memberships = await currentMemberships(user.id);
  const orgIds = [...new Set(memberships.map((row) => String(row.org_id)))];
  const membershipIds = memberships.map((row) => String(row.id));

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("id, full_name, email, phone, created_at")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) throw profileError;

  const empty = async () => [] as Record<string, unknown>[];
  const inOrganizations = (
    table: string,
    select: string,
    filters: (query: any) => any,
  ) => orgIds.length
    ? fetchAll((from, to) => filters(client.from(table).select(select).in("org_id", orgIds)).range(from, to))
    : empty();

  const [organizations, coordinatedAreas, conversations, messages, sessions, evidences, checkIns, documents, kpiValues, lifecycle, administrativeAudit] = await Promise.all([
    orgIds.length
      ? fetchAll((from, to) => client.from("organizations").select("id, name, subtitle, archived_at, created_at").in("id", orgIds).order("created_at").range(from, to))
      : empty(),
    membershipIds.length
      ? fetchAll((from, to) => client.from("areas").select("id, org_id, name, archived_at, created_at").in("coordinator_id", membershipIds).order("created_at").range(from, to))
      : empty(),
    inOrganizations("conversations", "*", (query) => query.eq("user_id", user.id).order("created_at")),
    inOrganizations("chat_messages", "*", (query) => query.eq("user_id", user.id).order("created_at")),
    inOrganizations("planning_sessions", "*", (query) => query.eq("user_id", user.id).order("created_at")),
    inOrganizations("evidences", "id, org_id, objective_id, text, created_at", (query) => query.eq("created_by", user.id).order("created_at")),
    inOrganizations("check_ins", "*", (query) => query.eq("created_by", user.id).order("created_at")),
    inOrganizations("plan_documents", "*", (query) => query.eq("created_by", user.id).order("created_at")),
    inOrganizations("kpi_monthly_values", "*", (query) => query.eq("updated_by", user.id).order("updated_at")),
    inOrganizations("organization_lifecycle_audit", "id, org_id, org_name, action, reason, metadata, created_at", (query) => query.eq("actor_user_id", user.id).order("created_at")),
    inOrganizations(
      "administrative_audit_events",
      "id, org_id, category, action, actor_user_id, actor_name, target_type, target_id, target_user_id, target_label, before_data, after_data, metadata, request_id, source, created_at",
      (query) => query.or(`actor_user_id.eq.${user.id},target_user_id.eq.${user.id}`).order("created_at"),
    ),
  ]);

  const payload = {
    format: "oraculo-personal-data-v1",
    exportedAt: new Date().toISOString(),
    scope: "Dados da conta, vínculos atuais, conversas próprias e registros de autoria acessíveis nas empresas atuais.",
    account: {
      id: user.id,
      email: user.email ?? profile?.email ?? null,
      fullName: profile?.full_name ?? null,
      phone: profile?.phone ?? null,
      authCreatedAt: user.created_at,
      authUpdatedAt: user.updated_at,
      lastSignInAt: user.last_sign_in_at ?? null,
    },
    organizations,
    memberships,
    coordinatedAreas,
    conversations,
    messages,
    planningSessions: sessions,
    authoredRecords: { evidences, checkIns, documents, kpiValues, organizationLifecycle: lifecycle, administrativeAudit },
  };

  const counts = {
    organizations: organizations.length,
    memberships: memberships.length,
    conversations: conversations.length,
    messages: messages.length,
    planningSessions: sessions.length,
    authoredRecords: evidences.length + checkIns.length + documents.length + kpiValues.length + lifecycle.length + administrativeAudit.length,
  };
  await finishRequest(requestId, "completed", counts);
  return payload;
}

async function assertDeletionAllowed(req: Request, userId: string, memberships: Record<string, unknown>[]) {
  const client = serviceClient();
  const orgIds = [...new Set(memberships.map((row) => String(row.org_id)))];

  if (orgIds.length) {
    const { data: mfaPolicies, error: mfaError } = await client
      .from("organization_security_settings")
      .select("org_id")
      .in("org_id", orgIds)
      .eq("require_mfa_for_critical_actions", true)
      .limit(1);
    if (mfaError) throw mfaError;
    if ((mfaPolicies ?? []).length) await assertAal2(req);
  }

  for (const membership of memberships) {
    if (membership.role !== "owner") continue;
    const orgId = String(membership.org_id);
    const [{ count, error: countError }, { data: organization, error: orgError }] = await Promise.all([
      client.from("memberships").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("role", "owner"),
      client.from("organizations").select("name").eq("id", orgId).maybeSingle(),
    ]);
    if (countError) throw countError;
    if (orgError) throw orgError;
    if ((count ?? 0) <= 1) {
      throw new BlockedRequestError(
        `Você é o único dono de ${organization?.name ?? "uma empresa"}. Promova outro owner ou encerre a empresa antes de excluir a conta.`,
      );
    }
  }

  // The database trigger repeats this check under row locks when Auth deletes the
  // profile, protecting the small interval between this friendly precheck and deleteUser.
  return userId;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Método não permitido" }, 405);

  let requestId: string | null = null;
  let action: Action | null = null;
  try {
    const user = await getUser(req);
    const payload = await req.json();
    action = asText(payload.action, 40) as Action;
    if (action !== "export" && action !== "delete") return jsonResponse({ error: "Ação inválida" }, 400);

    const fingerprint = await sha256(user.id);
    requestId = await createRequest(user.id, fingerprint, action === "export" ? "export" : "account_deletion");

    if (action === "export") {
      return jsonResponse({ ok: true, data: await exportPersonalData(user, requestId) });
    }

    const confirmEmail = asText(payload.confirmEmail).toLowerCase();
    if (!user.email || confirmEmail !== user.email.toLowerCase()) {
      throw new BlockedRequestError("Digite o email atual da conta para confirmar a exclusão.");
    }
    if (payload.finalConfirmation !== true) {
      throw new BlockedRequestError("Confirme explicitamente a exclusão da conta.");
    }

    const memberships = await currentMemberships(user.id);
    await assertDeletionAllowed(req, user.id, memberships);

    const { error: deleteError } = await serviceClient().auth.admin.deleteUser(user.id, false);
    if (deleteError) throw deleteError;

    await finishRequest(requestId, "completed", {
      membershipsRemoved: memberships.length,
      profileAnonymized: true,
      businessHistoryPreserved: true,
    });
    return jsonResponse({ ok: true, deleted: true });
  } catch (error) {
    const status: DataRequestStatus = error instanceof BlockedRequestError || isMfaRequiredError(error) ? "blocked" : "failed";
    if (requestId) await finishRequest(requestId, status, { reasonCode: status === "blocked" ? "guard" : "operation_failed" });
    if (isMfaRequiredError(error)) return jsonResponse({ error: error.message, code: error.code }, 403);
    const message = error instanceof Error ? error.message : "Não foi possível concluir a solicitação";
    const httpStatus = error instanceof BlockedRequestError ? 409 : /Sessão/.test(message) ? 401 : 400;
    return jsonResponse({ error: message }, httpStatus);
  }
});
