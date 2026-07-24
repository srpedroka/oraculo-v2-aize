import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getUser, serviceClient } from "../_shared/auth.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import {
  abandonPlanningSession,
  prepareReadyMonthlyPlanProposal,
  confirmPlanningProposal,
  prepareReadyQuarterlyPlanProposal,
  prepareReadyStrategicPlanProposal,
  processPlanningMessage,
  startPlanningSession,
  type PlanningSessionType,
} from "../_shared/session-engine.ts";
import { logStructured, requestId, safeErrorCode } from "../_shared/structured-log.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const requestLogId = requestId(req);
  const startedAt = performance.now();
  let action = "unknown";
  let requestedOrgId: string | null = null;
  try {
    const user = await getUser(req);
    const payload = await req.json();
    action = String(payload.action ?? "");
    requestedOrgId = typeof payload.orgId === "string" ? payload.orgId : null;
    const client = serviceClient();

    if (action === "start") {
      const result = await startPlanningSession(client, {
        orgId: String(payload.orgId ?? ""),
        areaId: payload.areaId ? String(payload.areaId) : null,
        type: String(payload.type ?? "") as PlanningSessionType,
        period: String(payload.period ?? ""),
        sourceDocumentId: payload.sourceDocumentId ? String(payload.sourceDocumentId) : null,
        reviewIntent: payload.reviewIntent ? String(payload.reviewIntent) : null,
        userId: user.id,
        channel: payload.channel === "whatsapp" ? "whatsapp" : "web",
      });
      return jsonResponse(result);
    }

    if (action === "message") {
      const result = await processPlanningMessage(client, {
        sessionId: String(payload.sessionId ?? ""),
        message: String(payload.message ?? ""),
        userId: user.id,
        channel: payload.channel === "whatsapp" ? "whatsapp" : "web",
      });
      return jsonResponse(result);
    }

    if (action === "import_ready_plan") {
      const result = await prepareReadyStrategicPlanProposal(client, {
        orgId: String(payload.orgId ?? ""),
        areaId: payload.areaId ? String(payload.areaId) : null,
        period: String(payload.period ?? ""),
        planText: String(payload.planText ?? payload.message ?? ""),
        fileName: payload.fileName ? String(payload.fileName) : null,
        userId: user.id,
        channel: payload.channel === "whatsapp" ? "whatsapp" : "web",
      });
      return jsonResponse(result);
    }

    if (action === "import_ready_quarterly_plan") {
      const result = await prepareReadyQuarterlyPlanProposal(client, {
        orgId: String(payload.orgId ?? ""),
        areaId: String(payload.areaId ?? ""),
        period: String(payload.period ?? ""),
        planText: String(payload.planText ?? payload.message ?? ""),
        fileName: payload.fileName ? String(payload.fileName) : null,
        userId: user.id,
        channel: payload.channel === "whatsapp" ? "whatsapp" : "web",
      });
      return jsonResponse(result);
    }

    if (action === "import_ready_monthly_plan") {
      const result = await prepareReadyMonthlyPlanProposal(client, {
        orgId: String(payload.orgId ?? ""),
        areaId: String(payload.areaId ?? ""),
        period: String(payload.period ?? ""),
        planText: String(payload.planText ?? payload.message ?? ""),
        fileName: payload.fileName ? String(payload.fileName) : null,
        userId: user.id,
        channel: payload.channel === "whatsapp" ? "whatsapp" : "web",
      });
      return jsonResponse(result);
    }

    if (action === "confirm") {
      const result = await confirmPlanningProposal(client, {
        sessionId: String(payload.sessionId ?? ""),
        userId: user.id,
        channel: payload.channel === "whatsapp" ? "whatsapp" : "web",
      });
      return jsonResponse(result);
    }

    if (action === "abandon") {
      const result = await abandonPlanningSession(client, {
        sessionId: String(payload.sessionId ?? ""),
        userId: user.id,
      });
      return jsonResponse(result);
    }

    return jsonResponse({ error: "Ação de sessão inválida" }, 400);
  } catch (error) {
    const errorCode = safeErrorCode(error);
    logStructured("error", {
      requestId: requestLogId,
      functionName: "oracle-session",
      orgId: requestedOrgId,
      operation: action,
      durationMs: Math.round(performance.now() - startedAt),
      status: "error",
      errorCode,
    });
    return jsonResponse({ error: error instanceof Error ? error.message : "Erro na sessão do Oráculo", errorCode }, 400);
  }
});
