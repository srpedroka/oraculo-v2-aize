import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { assertOrgMember, getUser, serviceClient } from "../_shared/auth.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { resolveAiFunction } from "../_shared/ai-router.ts";
import { callModel } from "../_shared/model.ts";
import { CONVERSATION_STYLE, guideForContext } from "../_shared/prompt-guides.ts";
import { recordAiUsage } from "../_shared/usage.ts";

function fallbackReview(objectives: any[]) {
  const risk = objectives.filter((objective) => ["at_risk", "late"].includes(objective.status));
  if (!objectives.length) {
    return "Ainda não encontrei um plano estruturado por aqui. Quer começar pelo Plano Estratégico ou por um plano trimestral?";
  }
  if (risk.length) {
    return `Tem um ponto que merece atenção: ${risk[0].title}. Quer que eu abra esse assunto com calma ou prefere um resumo geral?`;
  }
  return "No geral, não vejo ponto crítico agora. Quer um resumo rápido ou quer olhar uma área específica?";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const user = await getUser(req);
    const { orgId, areaId = null, message = "", context = "chat" } = await req.json();
    if (!orgId) return jsonResponse({ error: "Empresa obrigatória" }, 400);

    await assertOrgMember(user.id, orgId);
    const client = serviceClient();

    const aiRoute = await resolveAiFunction(client, orgId, "daily");
    const [{ data: objectives }, { data: areas }, { data: strategicPlan }, { data: areaPlans }, { data: history }] =
      await Promise.all([
        client.from("objectives").select("*").eq("org_id", orgId).order("created_at"),
        client.from("areas").select("*").eq("org_id", orgId).order("created_at"),
        client.from("strategic_plans").select("*").eq("org_id", orgId).order("year", { ascending: false }).limit(1).maybeSingle(),
        client.from("area_plans").select("*").eq("org_id", orgId),
        client.from("chat_messages").select("author, text").eq("org_id", orgId).order("created_at", { ascending: false }).limit(20),
    ]);

    let answer = "";
    if (!aiRoute) {
      answer = fallbackReview(objectives ?? []);
    } else {
      const guide = guideForContext(String(context));
      const systemPrompt = [
        "Você é o Oráculo, a IA Estratégica da empresa. Responda em português do Brasil.",
        "Conduza o usuário com perguntas curtas e mantenha a lógica de Resultado e Evolução sem soar mecânico.",
        "Se a pergunta for ambígua, peça esclarecimento antes de analisar dados.",
        "Nunca diga que salvou algo se a ação não foi gravada pelo sistema.",
        CONVERSATION_STYLE,
        guide,
        "Contexto atual do plano:",
        JSON.stringify({ strategicPlan, areaPlans, areas, objectives, areaId }, null, 2),
      ].join("\n\n");

      const modelMessages = [
        ...(history ?? [])
          .reverse()
          .map((item: { author: "oracle" | "user"; text: string }) => ({
            role: item.author === "oracle" ? "assistant" as const : "user" as const,
            content: item.text,
          })),
        { role: "user" as const, content: String(message) },
      ];

      try {
        const result = await callModel(aiRoute.provider, aiRoute.model, aiRoute.apiKey, systemPrompt, modelMessages, aiRoute.limits);
        answer = result.text;
        await recordAiUsage({
          client,
          orgId,
          provider: aiRoute.provider,
          model: aiRoute.model,
          channel: "web",
          usage: result.usage,
          settings: aiRoute.legacySettings,
          metadata: { context, areaId, aiFunction: "daily" },
        });
      } catch (modelError) {
        console.error("Erro ao chamar IA no chat web", modelError instanceof Error ? modelError.message : String(modelError));
        answer = fallbackReview(objectives ?? []);
      }
    }

    const { error } = await client.from("chat_messages").insert({
      org_id: orgId,
      area_id: areaId,
      author: "oracle",
      text: answer,
    });
    if (error) throw error;

    return jsonResponse({ answer });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Erro no Oráculo" }, 400);
  }
});
