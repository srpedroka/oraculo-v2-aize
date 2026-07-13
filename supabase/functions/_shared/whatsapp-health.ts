export type EvolutionConnectionState = "connected" | "connecting" | "disconnected" | "unknown";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function parseEvolutionConnectionState(payload: unknown): EvolutionConnectionState {
  const root = asRecord(payload);
  const instance = asRecord(root?.instance);
  const raw = String(instance?.state ?? instance?.status ?? root?.state ?? root?.status ?? "").trim().toLowerCase();
  if (["open", "connected", "online"].includes(raw)) return "connected";
  if (["connecting", "opening", "pairing"].includes(raw)) return "connecting";
  if (["close", "closed", "disconnected", "offline"].includes(raw)) return "disconnected";
  return "unknown";
}

export function safeEvolutionBaseUrl(rawValue: unknown): URL | null {
  try {
    const parsed = new URL(String(rawValue ?? ""));
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    const host = parsed.hostname.toLowerCase();
    if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) return null;
    const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4) {
      const parts = ipv4.slice(1).map(Number);
      if (parts.some((part) => part < 0 || part > 255)) return null;
      const [a, b] = parts;
      if (a === 0 || a === 10 || a === 127 || (a === 169 && b === 254)) return null;
      if ((a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return null;
      if ((a === 100 && b >= 64 && b <= 127) || a >= 224) return null;
    }
    if (host === "::1" || host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd")) return null;
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    parsed.search = "";
    parsed.hash = "";
    return parsed;
  } catch {
    return null;
  }
}

function webhookRow(payload: unknown) {
  const root = asRecord(payload);
  return asRecord(root?.webhook) ?? root;
}

export function webhookUrlMatches(actualValue: unknown, expectedValue: string) {
  if (typeof actualValue !== "string" || !actualValue.trim()) return false;
  try {
    const actual = new URL(actualValue);
    const expected = new URL(expectedValue);
    return actual.origin === expected.origin
      && actual.pathname.replace(/\/+$/, "") === expected.pathname.replace(/\/+$/, "")
      && actual.searchParams.get("orgId") === expected.searchParams.get("orgId");
  } catch {
    return false;
  }
}

export interface EvolutionWebhookState {
  configured: boolean;
  enabled: boolean | null;
  urlMatches: boolean;
  messagesEnabled: boolean | null;
}

export function parseEvolutionWebhookState(payload: unknown, expectedUrl: string): EvolutionWebhookState {
  const row = webhookRow(payload);
  if (!row) return { configured: false, enabled: null, urlMatches: false, messagesEnabled: null };

  const enabled = typeof row.enabled === "boolean" ? row.enabled : null;
  const urlMatches = webhookUrlMatches(row.url, expectedUrl);
  const events = Array.isArray(row.events) ? row.events.map((event) => String(event).toUpperCase().replace(/[.-]/g, "_")) : null;
  const messagesEnabled = events ? events.includes("MESSAGES_UPSERT") : null;
  const configured = enabled !== false && urlMatches && messagesEnabled !== false;
  return { configured, enabled, urlMatches, messagesEnabled };
}

export function safeEvolutionError(error: unknown) {
  if (error instanceof DOMException && error.name === "TimeoutError") return "timeout";
  const message = error instanceof Error ? error.message : String(error ?? "");
  const status = message.match(/HTTP\s+(\d{3})/i)?.[1];
  if (status) return `http_${status}`;
  if (/timeout|timed out/i.test(message)) return "timeout";
  return "unavailable";
}

export function shouldAlertSilentWebhook(input: {
  enabled: boolean;
  connection: EvolutionConnectionState;
  lastEventAt: string | null;
  now?: number;
}) {
  if (!input.enabled || input.connection !== "connected") return false;
  if (!input.lastEventAt) return true;
  const occurredAt = new Date(input.lastEventAt).getTime();
  if (!Number.isFinite(occurredAt)) return true;
  return (input.now ?? Date.now()) - occurredAt > 72 * 60 * 60 * 1000;
}
