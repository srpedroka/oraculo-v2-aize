type AuditClient = {
  from: (table: string) => any;
};

export type AdministrativeAuditCategory = "people" | "ai" | "whatsapp" | "security" | "backup" | "data";

const SENSITIVE_KEY = /(^|_)(api_?key|key|secret|token|password|authorization|credential|prompt|content|message|phone|email|media_?key|temporary_?url)(_|$)/i;
const SAFE_BOOLEAN_KEYS = new Set([
  "has_api_key",
  "has_webhook_secret",
  "api_key_changed",
  "webhook_secret_changed",
  "credentials_changed",
]);

function cleanText(value: unknown, max = 200) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function normalizedKey(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .toLowerCase();
}

function cleanLabel(value: unknown, max = 160) {
  return cleanText(value, max)
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "[contato removido]")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "[contato removido]");
}

function cleanIdentifier(value: unknown, max = 160) {
  const identifier = cleanText(value, max);
  return /^[a-zA-Z0-9._:/-]+$/.test(identifier) ? identifier : "";
}

function sanitizeValue(value: unknown, depth: number): unknown {
  if (value == null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return cleanText(value);
  if (depth >= 3) return "[limitado]";
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeValue(item, depth + 1));
  if (typeof value !== "object") return cleanText(value);

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .slice(0, 40)
      .filter(([key, entryValue]) => {
        const normalized = normalizedKey(key);
        if (!SENSITIVE_KEY.test(normalized)) return true;
        return SAFE_BOOLEAN_KEYS.has(normalized) && typeof entryValue === "boolean";
      })
      .map(([key, entryValue]) => [cleanText(key, 80), sanitizeValue(entryValue, depth + 1)]),
  );
}

export function sanitizeAuditData(value: unknown): Record<string, unknown> {
  const sanitized = sanitizeValue(value ?? {}, 0);
  return sanitized && typeof sanitized === "object" && !Array.isArray(sanitized)
    ? sanitized as Record<string, unknown>
    : {};
}

export function administrativeRequestId(req: Request) {
  const received = cleanIdentifier(req.headers.get("x-request-id") ?? req.headers.get("x-oraculo-request-id"), 160);
  return received || crypto.randomUUID();
}

export async function recordAdministrativeAudit(
  client: AuditClient,
  req: Request,
  input: {
    orgId: string;
    actorUserId: string | null;
    category: AdministrativeAuditCategory;
    action: string;
    targetType: string;
    targetId?: string | null;
    targetUserId?: string | null;
    targetLabel?: string | null;
    before?: unknown;
    after?: unknown;
    metadata?: unknown;
    requestId?: string;
    source?: "edge_function" | "migration" | "system";
  },
) {
  let actorName = "Sistema";
  if (input.actorUserId) {
    const { data, error } = await client
      .from("profiles")
      .select("full_name")
      .eq("id", input.actorUserId)
      .maybeSingle();
    if (error) throw error;
    actorName = cleanLabel(data?.full_name, 120) || "Usuário autenticado";
  }

  const { error } = await client.from("administrative_audit_events").upsert({
    org_id: input.orgId,
    category: input.category,
    action: cleanText(input.action, 80),
    actor_user_id: input.actorUserId,
    actor_name: actorName,
    target_type: cleanText(input.targetType, 60),
    target_id: input.targetId ? cleanIdentifier(input.targetId, 160) || null : null,
    target_user_id: input.targetUserId ?? null,
    target_label: input.targetLabel ? cleanLabel(input.targetLabel, 160) : null,
    before_data: sanitizeAuditData(input.before),
    after_data: sanitizeAuditData(input.after),
    metadata: sanitizeAuditData(input.metadata),
    request_id: cleanIdentifier(input.requestId, 160) || administrativeRequestId(req),
    source: input.source ?? "edge_function",
  }, { onConflict: "org_id,request_id,action", ignoreDuplicates: true });
  if (error) throw error;
}
