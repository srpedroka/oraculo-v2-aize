import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { assertAreaWriter, getUser, serviceClient } from "../_shared/auth.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { runInTransaction } from "../_shared/tx-runner.ts";
import { uuidFromToken } from "../_shared/tx-client.ts";

// Fatia 1D — criação manual de objetivo + ações-chave, atômica e idempotente.
// O frontend envia a linha do objetivo e as linhas de ações JÁ mapeadas (snake_case,
// via toObjectiveInsert/toKeyActionInsert). O servidor força id (derivado do token) e
// org_id (validado), revalida a permissão de área e grava tudo numa transação.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Método não permitido" }, 405);

  try {
    const user = await getUser(req);
    const body = await req.json();
    const orgId = String(body.orgId ?? "").trim();
    const token = String(body.token ?? "").trim().slice(0, 200) || crypto.randomUUID();
    const objectiveRow = (body.objectiveRow ?? {}) as Record<string, unknown>;
    const keyActionRows = Array.isArray(body.keyActionRows) ? (body.keyActionRows as Record<string, unknown>[]) : [];
    if (!orgId) return jsonResponse({ error: "Empresa obrigatória" }, 400);
    if (!String(objectiveRow.title ?? "").trim()) return jsonResponse({ error: "Título do objetivo obrigatório" }, 400);

    const areaId = objectiveRow.area_id != null ? String(objectiveRow.area_id) : null;
    // Revalida no servidor (service-role ignora RLS): dono ou coordenador da área.
    await assertAreaWriter(user.id, orgId, areaId);

    // Defesa em profundidade: parent_id e owner_membership_id (do objetivo e das ações)
    // precisam pertencer a ESTA empresa — a conexão de serviço ignora RLS/FK-por-org.
    const rest = serviceClient();
    const parentId = objectiveRow.parent_id != null ? String(objectiveRow.parent_id) : null;
    if (parentId) {
      const { data: parent, error: parentError } = await rest.from("objectives").select("id").eq("id", parentId).eq("org_id", orgId).maybeSingle();
      if (parentError) throw parentError;
      if (!parent) throw new Error("Objetivo pai inválido para esta empresa");
    }
    const membershipIds = new Set<string>();
    if (objectiveRow.owner_membership_id != null) membershipIds.add(String(objectiveRow.owner_membership_id));
    for (const ka of keyActionRows) if (ka.owner_membership_id != null) membershipIds.add(String(ka.owner_membership_id));
    if (membershipIds.size) {
      const { data: mems, error: memError } = await rest.from("memberships").select("id").eq("org_id", orgId).in("id", [...membershipIds]);
      if (memError) throw memError;
      const known = new Set((mems ?? []).map((m: { id: string }) => m.id));
      if ([...membershipIds].some((id) => !known.has(id))) throw new Error("Responsável inválido para esta empresa");
    }

    // Id do objetivo derivado do token: duplo clique/retry => mesmo id => dedup pela PK.
    const objectiveId = await uuidFromToken(token);

    const objective = await runInTransaction(async (tx) => {
      // Ignora id/org_id vindos do cliente: usa os validados.
      const row = { ...objectiveRow, id: objectiveId, org_id: orgId };
      const { data: inserted, error: objError } = await tx
        .from("objectives")
        .upsert(row, { onConflict: "id", ignoreDuplicates: true })
        .select("*");
      if (objError) throw objError;

      if (!inserted || inserted.length === 0) {
        // Criação repetida (mesmo token). Devolve o objetivo existente, sem recriar ações
        // (a criação anterior gravou objetivo + ações atomicamente).
        const { data: existing, error: existingError } = await tx.from("objectives").select("*").eq("id", objectiveId).single();
        if (existingError) throw existingError;
        if (!existing || existing.org_id !== orgId) throw new Error("Conflito de criação de objetivo; tente novamente.");
        return existing;
      }

      const created = inserted[0];
      if (keyActionRows.length) {
        // Amarra as ações ao objetivo criado; ignora org_id/objective_id do cliente.
        const rows = keyActionRows.map((ka) => ({ ...ka, org_id: orgId, objective_id: objectiveId }));
        const { error: kaError } = await tx.from("key_actions").insert(rows);
        if (kaError) throw kaError;
      }
      return created;
    });

    return jsonResponse({ objective });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Erro ao salvar objetivo" }, 400);
  }
});
