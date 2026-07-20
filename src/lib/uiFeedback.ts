import { reportFrontendError } from "./frontendError";

export interface RecoverableFeedback {
  title: string;
  description: string;
  occurrenceId: string;
}

const TECHNICAL_SIGNAL = /(https?:\/\/|\/functions\/|\b(?:api|json|postgres|supabase|fetch|network|stack|trace|typeerror|referenceerror)\b|\bstatus\s*\d{3}\b)/i;
const TECHNICAL_CONSTANT = /\b[A-Z][A-Z0-9_]{5,}\b/;

export function createUiOccurrenceId() {
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase();
  return `ORC-${suffix}`;
}

export function recoverableFeedback(
  error: unknown,
  fallbackTitle: string,
  description: string,
  errorCode = "RECOVERABLE_UI_ERROR",
): RecoverableFeedback {
  const rawMessage = error instanceof Error ? error.message.trim() : typeof error === "string" ? error.trim() : "";
  const occurrenceId = createUiOccurrenceId();
  const title = rawMessage && rawMessage.length <= 180 && !TECHNICAL_SIGNAL.test(rawMessage) && !TECHNICAL_CONSTANT.test(rawMessage)
    ? rawMessage
    : fallbackTitle;

  void reportFrontendError(occurrenceId, errorCode).catch(() => undefined);
  return { title, description, occurrenceId };
}
