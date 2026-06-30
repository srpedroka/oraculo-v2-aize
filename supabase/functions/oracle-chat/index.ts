import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { assertOrgMember, getUser, serviceClient } from "../_shared/auth.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { callModel, type Provider } from "../_shared/model.ts";

async function readGuide(context: string) {
  const fileName = context.includes("mensal")
    ? "oraculo-roteiro-mensal.md"
    : context.includes("trimestral") || context.includes("planos-trimestrais")
      ? "oraculo-roteiro-trimestral.md"
      : "oraculo-roteiro-estrategico.md";

  return await Deno.readTextFile(new URL(`../_shared/${fileName}`, import.meta.url));
}

function fallbackReview(objectives: any[]) {
  const risk = objectives.filter((objective) => ["at_risk", "late"].includes(objective.status));
  if (!objectives.length) {
    return "Vamos começar pelo Plano Estratégico. Primeiro defina um resultado observável, um prazo e quem responde por ele.";
  }
  if (risk.length) {
    return `Eu olharia primeiro para ${risk[0].title}. Qual evidência prova que isso avançou desde a última revisão?`;
  }
  return "O plano está sem pontos críticos aparentes. Agora registre evidências para manter Resultado e Evolução rastreáveis.";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const user = await getUser(req);
    const { orgId, areaId = null, message = "", context = "chat" } = await req.json();
    if (!orgId) return jsonResponse({ error: "Empresa obrigatória" }, 400);

    await assertOrgMember(user.id, orgId);
    const client = serviceClient();

    const [{ data: settings }, { data: keyRow }, { data: objectives }, { data: areas }, { data: strategicPlan }, { data: areaPlans }, { data: history }] =
      await Promise.all([
        client.from("ai_settings").select("*").eq("org_id", orgId).maybeSingle(),
        client.schema("private").from("ai_model_keys").select("*").eq("org_id", orgId).maybeSingle(),
        client.from("objectives").select("*").eq("org_id", orgId).order("created_at"),
        client.from("areas").select("*").eq("org_id", orgId).order("created_at"),
        client.from("strategic_plans").select("*").eq("org_id", orgId).order("year", { ascending: false }).limit(1).maybeSingle(),
        client.from("area_plans").select("*").eq("org_id", orgId),
        client.from("chat_messages").select("author, text").eq("org_id", orgId).order("created_at", { ascending: false }).limit(20),
      ]);

    let answer = "";
    if (!settings?.has_key || !keyRow?.api_key) {
      answer = fallbackReview(objectives ?? []);
    } else {
      const guide = await readGuide(String(context));
      const systemPrompt = [
        "Você é o Oráculo, a IA Estratégica da empresa. Responda em português do Brasil.",
        "Conduza o usuário com perguntas curtas, cobre evidência e mantenha a lógica de Resultado e Evolução.",
        "Nunca diga que salvou algo se a ação não foi gravada pelo sistema.",
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

      answer = await callModel(settings.provider as Provider, settings.model, keyRow.api_key, systemPrompt, modelMessages);
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
