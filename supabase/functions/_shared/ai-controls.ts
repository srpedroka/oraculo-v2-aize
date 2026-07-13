export const AI_LIMIT_MESSAGE = "O limite de IA desta empresa foi alcançado. Seus dados continuam salvos. O dono pode revisar o orçamento em Configurações > IA.";

type Client = any;

export interface AiControlContext {
  userId?: string | null;
  allowCompletion?: boolean;
}

export interface AiControlResult {
  allowed: boolean;
  mode: "monitor" | "block";
  reason: "person_rate" | "org_rate" | "monthly_budget" | null;
  personCount: number;
  personLimit: number;
  orgCount: number;
  orgLimit: number;
  monthlyCostUsd: number;
  monthlyBudgetUsd: number;
  completionBypass: boolean;
}

export class AiControlLimitError extends Error {
  readonly code = "AI_LIMIT_REACHED";

  constructor(readonly reason: AiControlResult["reason"]) {
    super(AI_LIMIT_MESSAGE);
    this.name = "AiControlLimitError";
  }
}

export async function evaluateAiControls(
  client: Client,
  orgId: string,
  context: AiControlContext = {},
) {
  const { data, error } = await client.rpc("evaluate_ai_call_controls", {
    p_org_id: orgId,
    p_user_id: context.userId ?? null,
    p_allow_completion: context.allowCompletion ?? false,
  });
  if (error) {
    console.error("Erro ao avaliar controles de IA", error.message ?? error);
    return null;
  }
  const result = data as AiControlResult;
  if (!result.allowed) throw new AiControlLimitError(result.reason);
  return result;
}

export function isAiControlLimitError(error: unknown): error is AiControlLimitError {
  return error instanceof AiControlLimitError;
}

