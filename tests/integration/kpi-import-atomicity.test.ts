import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anonClient, hasStagingEnv, serviceClient } from "../helpers/staging";
import { createDisposableOrg, destroyDisposableOrg, type DisposableOrg } from "../helpers/factory";
import { runStagingSql } from "../helpers/sql";

// Etapa 1 / Fatia 1B — atomicidade e idempotência da importação de KPI.
// Dirige o ENDPOINT REAL (apply-kpi-import) com JWT do dono, no staging.
// Prova: (1) caso feliz grava números + documento; (2) reenviar a mesma importação
// não cria documento novo; (3) se o documento falha, os números não mudam (rollback);
// (4) só owner/admin importam.

const RUN = hasStagingEnv();
const d = RUN ? describe : describe.skip;

const FN_URL = `${process.env.SUPABASE_STAGING_URL}/functions/v1/apply-kpi-import`;

let org: DisposableOrg;
let ownerJwt: string;
let coordJwt: string;
let kpiId: string;
const admin = RUN ? serviceClient() : (null as any);

async function signIn(email: string, password: string) {
  const { data, error } = await anonClient().auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`login falhou: ${error?.message}`);
  return data.session.access_token;
}

function importPayload(month: number, actual: number, token: string) {
  return {
    orgId: org.orgId,
    fileName: "kpis-teste-1b.xlsx",
    inputKind: "spreadsheet",
    applyToken: token,
    suggestion: {
      year: 2026,
      rows: [{ kpiKey: "revenue", year: 2026, month, targetValue: 1000, actualValue: actual }],
      summary: "Importação de teste 1B",
      warnings: [],
    },
  };
}

async function readValue(month: number): Promise<number | null> {
  const { data } = await admin.from("kpi_monthly_values")
    .select("actual_value").eq("org_id", org.orgId).eq("kpi_id", kpiId).eq("year", 2026).eq("month", month).maybeSingle();
  return data ? Number(data.actual_value) : null;
}

async function apply(jwt: string, payload: unknown) {
  const res = await fetch(FN_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return { status: res.status, body: (await res.json()) as any };
}

async function countValues(month: number): Promise<number> {
  const { count, error } = await admin
    .from("kpi_monthly_values")
    .select("kpi_id", { count: "exact", head: true })
    .eq("org_id", org.orgId).eq("kpi_id", kpiId).eq("year", 2026).eq("month", month);
  if (error) throw error;
  return count ?? 0;
}

async function countHistoryDocs(): Promise<number> {
  const { count, error } = await admin
    .from("plan_documents")
    .select("id", { count: "exact", head: true })
    .eq("org_id", org.orgId).eq("type", "kpi_history");
  if (error) throw error;
  return count ?? 0;
}

d("Fatia 1B — atomicidade e idempotência da importação de KPI (staging, endpoint real)", () => {
  beforeAll(async () => {
    org = await createDisposableOrg("1b");
    ownerJwt = await signIn(org.owner.email, org.owner.password);
    coordJwt = await signIn(org.coordinator.email, org.coordinator.password);
    // A fábrica não cria KPIs executivos; semeia um ("revenue").
    const { data, error } = await admin
      .from("executive_kpis")
      .insert({ org_id: org.orgId, kpi_key: "revenue", label: "Receita", unit: "currency" })
      .select("id").single();
    if (error || !data) throw new Error(`falha ao semear KPI: ${error?.message}`);
    kpiId = data.id as string;
  }, 60_000);

  afterAll(async () => {
    if (org) await destroyDisposableOrg(org);
  }, 60_000);

  it("caso feliz: grava número do KPI e o documento de histórico", async () => {
    const { status, body } = await apply(ownerJwt, importPayload(1, 900, "tok-feliz"));
    expect(status).toBe(200);
    expect(body.appliedCount).toBe(1);
    expect(body.document?.id).toBeTruthy();

    expect(await countValues(1)).toBe(1);
    const { data: value } = await admin.from("kpi_monthly_values")
      .select("actual_value").eq("org_id", org.orgId).eq("kpi_id", kpiId).eq("year", 2026).eq("month", 1).single();
    expect(Number(value.actual_value)).toBe(900);

    const { count: cmds } = await admin.from("operation_commands")
      .select("id", { count: "exact", head: true }).eq("org_id", org.orgId).eq("operation", "apply_kpi_import").eq("status", "completed");
    expect(cmds).toBe(1);
  });

  it("idempotência: reenviar a MESMA ação (mesmo token) devolve o mesmo documento, sem nova versão", async () => {
    const payload = importPayload(2, 500, "tok-idem");
    const first = await apply(ownerJwt, payload);
    expect(first.status).toBe(200);
    const firstDocId = first.body.document.id;
    const docsAfterFirst = await countHistoryDocs();

    const second = await apply(ownerJwt, payload);
    expect(second.status).toBe(200);
    // Mesmo documento (veio do resultado gravado), sem criar outro.
    expect(second.body.document.id).toBe(firstDocId);
    expect(await countHistoryDocs()).toBe(docsAfterFirst);
    expect(await countValues(2)).toBe(1);
  });

  it("idempotência ignora summary/warnings voláteis: mesmos lançamentos = mesmo documento", async () => {
    const base = importPayload(5, 321, "tok-summary");
    const withSummaryA = { ...base, suggestion: { ...base.suggestion, summary: "Resumo A da IA", warnings: ["aviso 1"] } };
    const withSummaryB = { ...base, suggestion: { ...base.suggestion, summary: "Texto totalmente diferente gerado de novo", warnings: [] } };

    const first = await apply(ownerJwt, withSummaryA);
    expect(first.status).toBe(200);
    const firstDocId = first.body.document.id;
    const docsBefore = await countHistoryDocs();

    // Mesmos números/arquivo, mas summary+warnings diferentes → NÃO pode virar nova versão.
    const second = await apply(ownerJwt, withSummaryB);
    expect(second.status).toBe(200);
    expect(second.body.document.id).toBe(firstDocId);
    expect(await countHistoryDocs()).toBe(docsBefore);
  });

  it("rollback: se o documento falha, o número do KPI não muda", async () => {
    // Gatilho temporário escopado a esta org: faz o INSERT do documento falhar.
    const cmdsBefore = (await admin.from("operation_commands")
      .select("id", { count: "exact", head: true }).eq("org_id", org.orgId).eq("operation", "apply_kpi_import").eq("status", "completed")).count ?? 0;
    await runStagingSql(`create or replace function _test_block_plan_doc_1b() returns trigger language plpgsql as $fn$
      begin if NEW.org_id = '${org.orgId}' then raise exception 'ROLLBACK-1B-TEST'; end if; return NEW; end $fn$;
      drop trigger if exists _test_block_plan_doc_1b on public.plan_documents;
      create trigger _test_block_plan_doc_1b before insert on public.plan_documents for each row execute function _test_block_plan_doc_1b();`);
    try {
      const { status, body } = await apply(ownerJwt, importPayload(3, 777, "tok-rollback"));
      expect(status).toBe(400);
      expect(body.error).toBeTruthy();
      // O número NÃO pode ter sido gravado (tudo-ou-nada).
      expect(await countValues(3)).toBe(0);
      // A tentativa que falhou não pode ter deixado um comando concluído (rollback total).
      const cmdsAfter = (await admin.from("operation_commands")
        .select("id", { count: "exact", head: true }).eq("org_id", org.orgId).eq("operation", "apply_kpi_import").eq("status", "completed")).count ?? 0;
      expect(cmdsAfter).toBe(cmdsBefore);
    } finally {
      await runStagingSql(`drop trigger if exists _test_block_plan_doc_1b on public.plan_documents; drop function if exists _test_block_plan_doc_1b();`);
    }
  });

  it("permissão: coordenador (não owner/admin) é recusado e nada é gravado", async () => {
    const { status, body } = await apply(coordJwt, importPayload(4, 123, "tok-perm"));
    expect(status).toBe(400);
    expect(String(body.error)).toContain("owner ou admin");
    expect(await countValues(4)).toBe(0);
  });

  it("reimportação deliberada (token novo) REAPLICA e corrige o valor — sem falso sucesso", async () => {
    // A: aplica 100 no mês 7.
    expect((await apply(ownerJwt, importPayload(7, 100, "tok-A"))).status).toBe(200);
    expect(await readValue(7)).toBe(100);
    // B: outra importação (token novo, valor diferente) sobrescreve para 200.
    expect((await apply(ownerJwt, importPayload(7, 200, "tok-B"))).status).toBe(200);
    expect(await readValue(7)).toBe(200);
    // Reimporta o conteúdo de A com um TOKEN NOVO (nova ação deliberada): deve REAPLICAR
    // e devolver 100 — não pode ser deduplicado como se já tivesse sido feito.
    const redo = await apply(ownerJwt, importPayload(7, 100, "tok-C"));
    expect(redo.status).toBe(200);
    expect(await readValue(7)).toBe(100);

    // E o duplo clique da MESMA ação (mesmo token) continua idempotente:
    const dupDoc = redo.body.document.id;
    const again = await apply(ownerJwt, importPayload(7, 100, "tok-C"));
    expect(again.body.document.id).toBe(dupDoc);
    expect(await readValue(7)).toBe(100);
  });
});
