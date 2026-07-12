import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anonClient, hasStagingEnv, serviceClient } from "../helpers/staging";
import { createDisposableOrg, destroyDisposableOrg, type DisposableOrg } from "../helpers/factory";

// Etapa 1 / Fatia 1D — objetivo + ações-chave e conjunto de vínculos de KPI, atômicos.
// Dirige os ENDPOINTS REAIS (save-objective, set-objective-kpi-links) no staging.

const RUN = hasStagingEnv();
const d = RUN ? describe : describe.skip;

const BASE = `${process.env.SUPABASE_STAGING_URL}/functions/v1`;
const MGMT = `https://api.supabase.com/v1/projects/${process.env.SUPABASE_STAGING_PROJECT_REF}/database/query`;

let org: DisposableOrg;
let ownerJwt: string;
let coordJwt: string;
let revenueKpiId: string;
let cashKpiId: string;
const admin = RUN ? serviceClient() : (null as any);

async function runSql(query: string) {
  const res = await fetch(MGMT, { method: "POST", headers: { Authorization: `Bearer ${process.env.SUPABASE_STAGING_ACCESS_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify({ query }) });
  if (!res.ok) throw new Error(`SQL falhou: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}
async function signIn(email: string, password: string) {
  const { data, error } = await anonClient().auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`login falhou: ${error?.message}`);
  return data.session.access_token;
}
async function call(fn: string, jwt: string, payload: unknown) {
  const res = await fetch(`${BASE}/${fn}`, { method: "POST", headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  return { status: res.status, body: (await res.json()) as any };
}
function objectiveRow(areaId: string | null, title: string) {
  return { area_id: areaId, level: "monthly", type: "harvest", title, result: "Resultado", status: "on_track", period: "2026-07", owner: "Responsável" };
}
async function countActions(objectiveId: string) {
  const { count } = await admin.from("key_actions").select("id", { count: "exact", head: true }).eq("org_id", org.orgId).eq("objective_id", objectiveId);
  return count ?? 0;
}
async function linkKpiIds(objectiveId: string): Promise<string[]> {
  const { data } = await admin.from("objective_kpi_links").select("kpi_id").eq("org_id", org.orgId).eq("objective_id", objectiveId).order("created_at");
  return (data ?? []).map((r: any) => r.kpi_id);
}

d("Fatia 1D — objetivo + ações e vínculos de KPI atômicos (staging, endpoint real)", () => {
  beforeAll(async () => {
    org = await createDisposableOrg("1d");
    ownerJwt = await signIn(org.owner.email, org.owner.password);
    coordJwt = await signIn(org.coordinator.email, org.coordinator.password);
    const { data: rev } = await admin.from("executive_kpis").insert({ org_id: org.orgId, kpi_key: "revenue", label: "Receita", unit: "currency" }).select("id").single();
    const { data: cash } = await admin.from("executive_kpis").insert({ org_id: org.orgId, kpi_key: "cash", label: "Caixa", unit: "currency" }).select("id").single();
    revenueKpiId = rev.id; cashKpiId = cash.id;
  }, 60_000);

  afterAll(async () => { if (org) await destroyDisposableOrg(org); }, 60_000);

  // ---- save-objective ----
  it("caso feliz: cria objetivo + ações-chave", async () => {
    const { status, body } = await call("save-objective", ownerJwt, {
      orgId: org.orgId, token: "tok-1d-feliz",
      objectiveRow: objectiveRow(org.areas.producaoId, "Obj 1D Feliz"),
      keyActionRows: [
        { description: "Ação A", completion_criterion: "Feito", status: "on_track" },
        { description: "Ação B", completion_criterion: "Feito", status: "on_track" },
      ],
    });
    expect(status).toBe(200);
    const objId = body.objective.id as string;
    expect(objId).toBeTruthy();
    expect(body.objective.org_id).toBe(org.orgId);
    expect(await countActions(objId)).toBe(2);
  });

  it("idempotência: mesmo token => mesmo objetivo, sem duplicar ações", async () => {
    const payload = { orgId: org.orgId, token: "tok-1d-idem", objectiveRow: objectiveRow(org.areas.producaoId, "Obj 1D Idem"), keyActionRows: [{ description: "Ação única", completion_criterion: "Feito", status: "on_track" }] };
    const first = await call("save-objective", ownerJwt, payload);
    const objId = first.body.objective.id;
    const second = await call("save-objective", ownerJwt, payload);
    expect(second.body.objective.id).toBe(objId);
    expect(await countActions(objId)).toBe(1);
  });

  it("rollback: falha ao gravar as ações não deixa objetivo órfão", async () => {
    await runSql(`create or replace function _test_block_ka_1d() returns trigger language plpgsql as $fn$
      begin if NEW.org_id = '${org.orgId}' then raise exception 'ROLLBACK-1D-KA'; end if; return NEW; end $fn$;
      drop trigger if exists _test_block_ka_1d on public.key_actions;
      create trigger _test_block_ka_1d before insert on public.key_actions for each row execute function _test_block_ka_1d();`);
    try {
      const { status } = await call("save-objective", ownerJwt, { orgId: org.orgId, token: "tok-1d-rb", objectiveRow: objectiveRow(org.areas.producaoId, "Obj 1D Rollback"), keyActionRows: [{ description: "Ação", completion_criterion: "x", status: "on_track" }] });
      expect(status).toBe(400);
      const { data: orphans } = await admin.from("objectives").select("id").eq("org_id", org.orgId).eq("title", "Obj 1D Rollback");
      expect(orphans).toHaveLength(0);
    } finally {
      await runSql(`drop trigger if exists _test_block_ka_1d on public.key_actions; drop function if exists _test_block_ka_1d();`);
    }
  });

  it("permissão: coordenador não cria objetivo em área alheia", async () => {
    const { status } = await call("save-objective", coordJwt, { orgId: org.orgId, token: "tok-1d-perm", objectiveRow: objectiveRow(org.areas.comercialId, "Obj 1D Proibido"), keyActionRows: [] });
    expect(status).toBe(400);
    const { data } = await admin.from("objectives").select("id").eq("org_id", org.orgId).eq("title", "Obj 1D Proibido");
    expect(data).toHaveLength(0);
  });

  // ---- set-objective-kpi-links ----
  it("conjunto de vínculos: trocar o conjunto remove os que saíram e mantém a ordem", async () => {
    const objId = org.objectiveId; // objetivo da fábrica (área Produção)
    expect((await call("set-objective-kpi-links", ownerJwt, { orgId: org.orgId, objectiveId: objId, links: [{ kpiId: revenueKpiId }] })).status).toBe(200);
    expect(await linkKpiIds(objId)).toEqual([revenueKpiId]);
    expect((await call("set-objective-kpi-links", ownerJwt, { orgId: org.orgId, objectiveId: objId, links: [{ kpiId: revenueKpiId }, { kpiId: cashKpiId }] })).status).toBe(200);
    expect(await linkKpiIds(objId)).toEqual([revenueKpiId, cashKpiId]); // ordem preservada
    // Troca para só cash: revenue é removido (prune).
    expect((await call("set-objective-kpi-links", ownerJwt, { orgId: org.orgId, objectiveId: objId, links: [{ kpiId: cashKpiId }] })).status).toBe(200);
    expect(await linkKpiIds(objId)).toEqual([cashKpiId]);
    // Idempotente: salvar o mesmo conjunto de novo não muda nada.
    expect((await call("set-objective-kpi-links", ownerJwt, { orgId: org.orgId, objectiveId: objId, links: [{ kpiId: cashKpiId }] })).status).toBe(200);
    expect(await linkKpiIds(objId)).toEqual([cashKpiId]);
    // Conjunto vazio limpa tudo.
    expect((await call("set-objective-kpi-links", ownerJwt, { orgId: org.orgId, objectiveId: objId, links: [] })).status).toBe(200);
    expect(await linkKpiIds(objId)).toEqual([]);
  });

  it("vínculos rollback: falha no prune não altera o conjunto anterior", async () => {
    const objId = org.objectiveId;
    // Estado inicial conhecido: [revenue].
    await call("set-objective-kpi-links", ownerJwt, { orgId: org.orgId, objectiveId: objId, links: [{ kpiId: revenueKpiId }] });
    expect(await linkKpiIds(objId)).toEqual([revenueKpiId]);
    // Gatilho que faz QUALQUER delete em objective_kpi_links desta org falhar (bloqueia o prune).
    await runSql(`create or replace function _test_block_link_del_1d() returns trigger language plpgsql as $fn$
      begin if OLD.org_id = '${org.orgId}' then raise exception 'ROLLBACK-1D-LINK'; end if; return OLD; end $fn$;
      drop trigger if exists _test_block_link_del_1d on public.objective_kpi_links;
      create trigger _test_block_link_del_1d before delete on public.objective_kpi_links for each row execute function _test_block_link_del_1d();`);
    try {
      // Tentar trocar para [cash]: upsert de cash entra, prune de revenue falha => rollback total.
      const { status } = await call("set-objective-kpi-links", ownerJwt, { orgId: org.orgId, objectiveId: objId, links: [{ kpiId: cashKpiId }] });
      expect(status).toBe(400);
      // Conjunto continua exatamente [revenue] — nem cash entrou, nem revenue saiu.
      expect(await linkKpiIds(objId)).toEqual([revenueKpiId]);
    } finally {
      await runSql(`drop trigger if exists _test_block_link_del_1d on public.objective_kpi_links; drop function if exists _test_block_link_del_1d();`);
    }
  });

  it("permissão: coordenador não altera vínculos de objetivo em área alheia", async () => {
    // Objetivo em Comercial (criado pelo dono).
    const created = await call("save-objective", ownerJwt, { orgId: org.orgId, token: "tok-1d-comercial", objectiveRow: objectiveRow(org.areas.comercialId, "Obj Comercial 1D"), keyActionRows: [] });
    const objId = created.body.objective.id;
    const { status } = await call("set-objective-kpi-links", coordJwt, { orgId: org.orgId, objectiveId: objId, links: [{ kpiId: revenueKpiId }] });
    expect(status).toBe(400);
    expect(await linkKpiIds(objId)).toEqual([]);
  });

  // ---- correções da verificação adversarial ----
  it("segurança: KPI que não pertence à empresa é recusado (sem RLS na função de serviço)", async () => {
    const objId = org.objectiveId;
    await call("set-objective-kpi-links", ownerJwt, { orgId: org.orgId, objectiveId: objId, links: [] }); // limpa
    const { status, body } = await call("set-objective-kpi-links", ownerJwt, {
      orgId: org.orgId, objectiveId: objId, links: [{ kpiId: "00000000-0000-0000-0000-000000000000" }],
    });
    expect(status).toBe(400);
    expect(String(body.error)).toContain("KPI inválido");
    expect(await linkKpiIds(objId)).toEqual([]);
  });

  it("robustez: kpiId duplicado no payload é deduplicado (não quebra o save)", async () => {
    const objId = org.objectiveId;
    await call("set-objective-kpi-links", ownerJwt, { orgId: org.orgId, objectiveId: objId, links: [] });
    const { status } = await call("set-objective-kpi-links", ownerJwt, {
      orgId: org.orgId, objectiveId: objId, links: [{ kpiId: revenueKpiId }, { kpiId: revenueKpiId }],
    });
    expect(status).toBe(200);
    expect(await linkKpiIds(objId)).toEqual([revenueKpiId]);
  });

  it("segurança: parent_id de fora da empresa é recusado na criação do objetivo", async () => {
    const { status, body } = await call("save-objective", ownerJwt, {
      orgId: org.orgId, token: "tok-1d-badparent",
      objectiveRow: { ...objectiveRow(org.areas.producaoId, "Obj parent inválido"), parent_id: "00000000-0000-0000-0000-000000000000" },
      keyActionRows: [],
    });
    expect(status).toBe(400);
    expect(String(body.error)).toContain("pai inválido");
    const { data } = await admin.from("objectives").select("id").eq("org_id", org.orgId).eq("title", "Obj parent inválido");
    expect(data).toHaveLength(0);
  });
});
