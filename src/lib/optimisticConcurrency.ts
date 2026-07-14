export const STALE_WRITE_CODE = "CONFLICT_STALE_WRITE";
export const STALE_WRITE_MESSAGE = "Este dado mudou em outra sessão. Recarregue a versão atual antes de salvar novamente.";

export function isStaleWriteError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown; details?: unknown };
  return candidate.code === "40001"
    || candidate.code === "23505"
    || candidate.code === STALE_WRITE_CODE
    || String(candidate.message ?? "").includes(STALE_WRITE_CODE)
    || String(candidate.details ?? "").includes(STALE_WRITE_CODE);
}

export function conflictMessage(error: unknown, fallback: string) {
  if (isStaleWriteError(error)) return STALE_WRITE_MESSAGE;
  return error instanceof Error ? error.message : fallback;
}
