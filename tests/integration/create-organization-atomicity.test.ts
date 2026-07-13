import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anonClient, hasStagingEnv, serviceClient } from "../helpers/staging";
import { runStagingSql } from "../helpers/sql";

// Etapa 1 / Fatia 1C — criação de empresa atômica e idempotente.
// Dirige o ENDPOINT REAL (create-organization) com JWT de um usuário descartável.
// Prova: (1) caso feliz cria org + dono + ai_settings + 4 KPIs; (2) mesmo token não
// cria duas empresas; (3) token novo cria outra; (4) falha no seed não deixa nada;
// (5) sem login é recusado.

const RUN = hasStagingEnv();
const d = RUN ? describe : describe.skip;

const FN_URL = `${process.env.SUPABASE_STAGING_URL}/functions/v1/create-organization`;

const admin = RUN ? serviceClient() : (null as any);
const stamp = Date.now();
const email = `e2e-1c-${stamp}@oraculo-e2e.invalid`;
const password = "Oraculo-E2E-teste-123!";
let userId: string;
let userJwt: string;
const createdOrgIds: string[] = [];

async function purgeOrg(orgId: string) {
  await runStagingSql(`do $$ declare t text; begin set local session_replication_role=replica;
    for t in
      select c.table_name from information_schema.columns c
      join information_schema.tables i on i.table_schema=c.table_schema and i.table_name=c.table_name
      where c.table_schema='public' and c.column_name='org_id' and i.table_type='BASE TABLE'
    loop
      execute format('delete from public.%I where org_id=%L', t, '${orgId}'); end loop;
    delete from public.organizations where id='${orgId}'; end $$;`);
}

async function createOrg(payload: Record<string, unknown>) {
  const res = await fetch(FN_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${userJwt}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = (await res.json()) as any;
  if (body?.org?.id) createdOrgIds.push(body.org.id);
  return { status: res.status, body };
}

async function countBy(table: string, orgId: string): Promise<number> {
  const { count, error } = await admin.from(table).select("org_id", { count: "exact", head: true }).eq("org_id", orgId);
  if (error) throw error;
  return count ?? 0;
}

d("Fatia 1C — criação de empresa atômica e idempotente (staging, endpoint real)", () => {
  beforeAll(async () => {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw new Error(`falha ao criar usuário: ${error?.message}`);
    userId = data.user.id;
    await admin.from("profiles").upsert({ id: userId, full_name: "E2E 1C", email });
    const login = await anonClient().auth.signInWithPassword({ email, password });
    if (login.error || !login.data.session) throw new Error(`login falhou: ${login.error?.message}`);
    userJwt = login.data.session.access_token;
  }, 60_000);

  afterAll(async () => {
    for (const id of [...new Set(createdOrgIds)]) await purgeOrg(id);
    if (userId) await admin.auth.admin.deleteUser(userId);
  }, 60_000);

  it("caso feliz: cria organização + dono + ai_settings + 4 KPIs", async () => {
    const { status, body } = await createOrg({ name: "Empresa 1C Feliz", subtitle: "teste", token: "tok-1c-feliz" });
    expect(status).toBe(200);
    const orgId = body.org.id as string;
    expect(orgId).toBeTruthy();
    expect(body.org.created_by).toBe(userId);

    const { data: mem } = await admin.from("memberships").select("role, user_id").eq("org_id", orgId);
    expect(mem).toHaveLength(1);
    expect(mem[0].role).toBe("owner");
    expect(mem[0].user_id).toBe(userId);

    expect(await countBy("ai_settings", orgId)).toBe(1);
    expect(await countBy("executive_kpis", orgId)).toBe(4);
  });

  it("idempotência: mesmo token devolve a MESMA empresa, sem duplicar seeds", async () => {
    const payload = { name: "Empresa 1C Idem", token: "tok-1c-idem" };
    const first = await createOrg(payload);
    expect(first.status).toBe(200);
    const orgId = first.body.org.id as string;

    const second = await createOrg(payload);
    expect(second.status).toBe(200);
    expect(second.body.org.id).toBe(orgId);

    // Continua exatamente 1 dono e 4 KPIs — nada duplicado.
    const { data: mem } = await admin.from("memberships").select("id").eq("org_id", orgId);
    expect(mem).toHaveLength(1);
    expect(await countBy("executive_kpis", orgId)).toBe(4);
  });

  it("token novo => nova empresa", async () => {
    const a = await createOrg({ name: "Empresa 1C Nova", token: "tok-1c-a" });
    const b = await createOrg({ name: "Empresa 1C Nova", token: "tok-1c-b" });
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a.body.org.id).not.toBe(b.body.org.id);
  });

  it("rollback: falha no seed dos KPIs não deixa organização nem dono", async () => {
    // Gatilho temporário: faz o insert de executive_kpis falhar para orgs deste usuário.
    await runStagingSql(`create or replace function _test_block_kpi_1c() returns trigger language plpgsql as $fn$
      begin if exists (select 1 from organizations o where o.id = NEW.org_id and o.created_by = '${userId}') then raise exception 'ROLLBACK-1C-TEST'; end if; return NEW; end $fn$;
      drop trigger if exists _test_block_kpi_1c on public.executive_kpis;
      create trigger _test_block_kpi_1c before insert on public.executive_kpis for each row execute function _test_block_kpi_1c();`);
    try {
      const { status, body } = await createOrg({ name: "Empresa 1C Rollback", token: "tok-1c-rollback" });
      expect(status).toBe(400);
      expect(body.error).toBeTruthy();
      // NADA pode ter sobrado: nem a organização, nem o dono.
      const { data: orgs } = await admin.from("organizations").select("id").eq("name", "Empresa 1C Rollback").eq("created_by", userId);
      expect(orgs).toHaveLength(0);
    } finally {
      await runStagingSql(`drop trigger if exists _test_block_kpi_1c on public.executive_kpis; drop function if exists _test_block_kpi_1c();`);
    }
  });

  it("permissão: sem login (chave anônima, sem usuário) é recusado", async () => {
    const res = await fetch(FN_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.SUPABASE_STAGING_ANON_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Empresa 1C Anon", token: "tok-1c-anon" }),
    });
    expect(res.status).toBe(400);
  });
});
