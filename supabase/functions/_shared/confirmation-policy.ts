import { normalizeTextForRouting } from "./periods.ts";

export function isConfirmationMessage(value: string) {
  const normalized = normalizeTextForRouting(value).replace(/[.!?]+$/g, "").trim();
  if (/\b(confirmo|pode gravar|pode salvar|pode registrar|quero gravar|quero salvar|quero registrar|ja esta conferido pode gravar)\b/.test(normalized)) {
    return true;
  }
  return ["sim", "ok", "fechado", "confirma", "confirmado", "confirmar", "gravar", "salvar", "registrar"].includes(normalized);
}
