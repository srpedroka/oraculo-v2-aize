// Etapa 1 / Fatia 1A — Execucao transacional com trava de idempotencia.
//
// Deno-only (abre conexao direta ao Postgres via SUPABASE_DB_URL, injetado pela
// plataforma nas Edge Functions). A logica pura do adaptador/chave vive em tx-client.ts
// (testavel em Node). Aqui fica so o que precisa da conexao real.

import { Client } from "https://deno.land/x/postgres@v0.19.3/mod.ts";
import { TxClient, ProposalConflictError, type CommandKey, type CommandWork, type CommandOutcome } from "./tx-client.ts";

// Abre uma conexao direta, roda `work` dentro de UMA transacao com trava de
// idempotencia, e comita tudo-ou-nada. Em qualquer erro: rollback total (nada
// persiste, nem a linha de comando). Em confirmacao repetida: devolve o resultado
// ja gravado sem reexecutar. Em concorrencia: a unique + o lock de linha serializam
// as duas requisicoes (a segunda ve a primeira concluida e nao duplica).
export async function runIdempotentCommand(key: CommandKey, work: CommandWork): Promise<CommandOutcome> {
  const url = Deno.env.get("SUPABASE_DB_URL");
  if (!url) throw new Error("SUPABASE_DB_URL ausente no runtime da Edge Function");
  const client = new Client(url);
  await client.connect();
  const tx = client.createTransaction("proposal_tx");
  let began = false;
  let settled = false;
  try {
    await tx.begin();
    began = true;

    const claim = await tx.queryObject<{ id: string }>({
      text:
        `insert into operation_commands (org_id, operation, idempotency_key, request_hash, actor_user_id, status)
         values ($1, $2, $3, $4, $5, 'processing')
         on conflict (org_id, operation, idempotency_key) do nothing
         returning id`,
      args: [key.orgId, key.operation, key.idempotencyKey, key.requestHash, key.actorUserId],
    });

    if (claim.rows.length === 0) {
      // Ja existe e concluida por outra requisicao (mesmo conteudo => mesma chave).
      // Nada foi escrito por nos nesta transacao.
      const existing = await tx.queryObject<{ request_hash: string; result: any }>({
        text: `select request_hash, result from operation_commands where org_id = $1 and operation = $2 and idempotency_key = $3`,
        args: [key.orgId, key.operation, key.idempotencyKey],
      });
      await tx.commit();
      settled = true;
      const row = existing.rows[0];
      if (!row) throw new Error("Falha ao recuperar comando idempotente existente");
      if (row.request_hash !== key.requestHash) throw new ProposalConflictError();
      return { duplicate: true, result: (row.result ?? {}) as Record<string, unknown> };
    }

    const commandId = claim.rows[0].id;
    const txClient = new TxClient(tx);
    const res = await work(txClient);

    await tx.queryObject({
      text: `update operation_commands set status = 'completed', result = $2::jsonb, completed_at = now() where id = $1`,
      args: [commandId, JSON.stringify(res.result)],
    });

    await tx.commit();
    settled = true;
    return { duplicate: false, result: res.result };
  } catch (e) {
    if (began && !settled) {
      try { await tx.rollback(); } catch (_) { /* tx ja abortada */ }
    }
    throw e;
  } finally {
    try { await client.end(); } catch (_) { /* noop */ }
  }
}
