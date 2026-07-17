type LogLevel = "info" | "warn" | "error";

type LogFields = {
  requestId?: string;
  functionName: string;
  orgId?: string | null;
  userId?: string | null;
  operation: string;
  durationMs?: number;
  status: "ok" | "error";
  errorCode?: string | null;
  correlationId?: string | null;
};

function redact(value: unknown): unknown {
  if (typeof value !== "string") return value;
  return value
    .replace(/https?:\/\/[^\s]+/gi, "[url]")
    .replace(/\bBearer\s+[^\s]+/gi, "Bearer [redacted]")
    .replace(/\b(api[_-]?key|token|secret|password|authorization|mediaKey)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
    .replace(/[+]?\d[\d\s().-]{7,}\d/g, "[phone]")
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[email]")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .slice(0, 300);
}

function safeFields(fields: LogFields) {
  return Object.fromEntries(
    Object.entries(fields)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, redact(value)]),
  );
}

export function requestId(req?: Request) {
  const incoming = req?.headers.get("x-request-id") || req?.headers.get("x-correlation-id");
  return incoming && /^[A-Za-z0-9._:-]{1,120}$/.test(incoming) ? incoming : crypto.randomUUID();
}

export function logStructured(level: LogLevel, fields: LogFields) {
  const line = JSON.stringify({
    level,
    timestamp: new Date().toISOString(),
    ...safeFields(fields),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

export function safeErrorCode(error: unknown) {
  const nativeCode = error && typeof error === "object" && "code" in error
    ? String((error as { code?: unknown }).code ?? "").trim()
    : "";
  if (/^[A-Za-z0-9_.:-]{2,80}$/.test(nativeCode)) return nativeCode.toUpperCase();
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/timeout|timed out/i.test(message)) return "TIMEOUT";
  if (/unauthori[sz]|forbidden|permission/i.test(message)) return "AUTHORIZATION";
  if (/fetch|network|connection|econn|unavailable/i.test(message)) return "DEPENDENCY_UNAVAILABLE";
  return "INTERNAL_ERROR";
}

export function withRequestLog<T>(
  req: Request,
  fields: Omit<LogFields, "requestId" | "durationMs" | "status">,
  work: (id: string) => Promise<T>,
) {
  const id = requestId(req);
  const started = performance.now();
  return work(id)
    .then((result) => {
      logStructured("info", { ...fields, requestId: id, durationMs: Math.round(performance.now() - started), status: "ok" });
      return result;
    })
    .catch((error) => {
      logStructured("error", {
        ...fields,
        requestId: id,
        durationMs: Math.round(performance.now() - started),
        status: "error",
        errorCode: safeErrorCode(error),
      });
      throw error;
    });
}
