import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getUser, serviceClient } from "../_shared/auth.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import {
  abandonPlanningSession,
  confirmPlanningProposal,
  prepareReadyStrategicPlanProposal,
  processPlanningMessage,
  startPlanningSession,
  type PlanningSessionType,
} from "../_shared/session-engine.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const user = await getUser(req);
    const payload = await req.json();
    const action = String(payload.action ?? "");
    const client = serviceClient();

    if (action === "start") {
      const result = await startPlanningSession(client, {
        orgId: String(payload.orgId ?? ""),
        areaId: payload.areaId ? String(payload.areaId) : null,
        type: String(payload.type ?? "") as PlanningSessionType,
        period: String(payload.period ?? ""),
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
    return jsonResponse({ error: error instanceof Error ? error.message : "Erro na sessão do Oráculo" }, 400);
  }
});
