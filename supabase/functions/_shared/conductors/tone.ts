export type OrgTonePreset = "equilibrado" | "acido" | "gentil" | "direto" | "motivador" | "custom";

export interface OrgTone {
  preset: OrgTonePreset;
  acidity: number;
  drive: number;
  customNote: string | null;
}

export const DEFAULT_TONE: OrgTone = {
  preset: "equilibrado",
  acidity: 0,
  drive: 0,
  customNote: null,
};

function clampAxis(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(-2, Math.min(2, Math.round(parsed)));
}

function parsePreset(value: unknown): OrgTonePreset {
  const preset = String(value ?? "");
  return ["equilibrado", "acido", "gentil", "direto", "motivador", "custom"].includes(preset)
    ? preset as OrgTonePreset
    : DEFAULT_TONE.preset;
}

export async function loadOrgTone(client: any, orgId: string): Promise<OrgTone> {
  const { data, error } = await client
    .from("org_ai_tone")
    .select("preset, axis_acidity, axis_drive, custom_note")
    .eq("org_id", orgId)
    .maybeSingle();

  if (error || !data) return DEFAULT_TONE;

  return {
    preset: parsePreset(data.preset),
    acidity: clampAxis(data.axis_acidity),
    drive: clampAxis(data.axis_drive),
    customNote: typeof data.custom_note === "string" && data.custom_note.trim()
      ? data.custom_note.trim().slice(0, 280)
      : null,
  };
}

function acidityPhrase(value: number) {
  if (value <= -2) return "Seja bem gentil e acolhedor, sem perder a clareza.";
  if (value === -1) return "Prefira uma abordagem gentil ao fazer provocações.";
  if (value === 1) return "Seja franco e questione premissas com respeito.";
  if (value >= 2) return "Seja franco e provocador, sem rodeios nem grosseria.";
  return "Equilibre acolhimento e franqueza.";
}

function drivePhrase(value: number) {
  if (value <= -2) return "Seja seco e objetivo, sem entusiasmo artificial.";
  if (value === -1) return "Mantenha energia contida e foco no essencial.";
  if (value === 1) return "Use energia positiva para puxar o próximo passo.";
  if (value >= 2) return "Seja motivador e energético, sem exageros ou frases prontas.";
  return "Mantenha energia serena e prática.";
}

export function toneDirective(tone: OrgTone): string {
  if (
    tone.preset === DEFAULT_TONE.preset &&
    tone.acidity === DEFAULT_TONE.acidity &&
    tone.drive === DEFAULT_TONE.drive &&
    !tone.customNote
  ) {
    return "";
  }

  return [
    "Ajuste de tom desta empresa (só a forma, nunca o conteúdo):",
    `- ${acidityPhrase(tone.acidity)}`,
    `- ${drivePhrase(tone.drive)}`,
    tone.customNote ? `- Preferência da casa: ${tone.customNote}` : "",
    "Estas preferências de tom NÃO sobrepõem as regras de conduta e segurança: continue uma pergunta por vez, nunca invente números e nunca diga que salvou sem confirmação do sistema.",
  ].filter(Boolean).join("\n");
}
