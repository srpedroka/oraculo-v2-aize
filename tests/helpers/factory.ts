import { serviceClient } from "./staging";
import { runStagingSql } from "./sql";

// Fábrica de organização DESCARTÁVEL para testes (só no staging).
// Cria owner + coordenador + admin, org "E2E Oraculo <timestamp>", áreas Produção e
// Comercial, e um objetivo mínimo. Sempre chamar destroyDisposableOrg no final — ela
// falha de forma VISÍVEL se a limpeza não acontecer.

const TEST_PASSWORD = "Oraculo-E2E-teste-123!";

export interface DisposableUser {
  id: string;
  email: string;
  password: string;
  membershipId: string;
  role: "owner" | "coordinator" | "admin";
}

export interface DisposableOrg {
  orgId: string;
  label: string;
  owner: DisposableUser;
  coordinator: DisposableUser;
  admin: DisposableUser;
  areas: { producaoId: string; comercialId: string };
  objectiveId: string;
}

function stampId() {
  return `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

export async function createDisposableOrg(tag = "test"): Promise<DisposableOrg> {
  const admin = serviceClient();
  const stamp = stampId();
  const label = `E2E Oraculo ${stamp}`;

  async function newUser(kind: string): Promise<{ id: string; email: string }> {
    const email = `e2e-${kind}-${stamp}-${tag}@oraculo-e2e.invalid`;
    const { data, error } = await admin.auth.admin.createUser({ email, password: TEST_PASSWORD, email_confirm: true });
    if (error || !data.user) throw new Error(`falha ao criar usuário ${kind}: ${error?.message}`);
    const { error: profileError } = await admin.from("profiles").upsert({ id: data.user.id, full_name: `E2E ${kind}`, email });
    if (profileError) throw new Error(`falha ao criar profile ${kind}: ${profileError.message}`);
    return { id: data.user.id, email };
  }

  const ownerU = await newUser("owner");
  const coordU = await newUser("coord");
  const adminU = await newUser("admin");

  const { data: org, error: orgError } = await admin
    .from("organizations")
    .insert({ name: label, subtitle: "descartável", created_by: ownerU.id })
    .select("id")
    .single();
  if (orgError || !org) throw new Error(`falha ao criar org: ${orgError?.message}`);
  const orgId = org.id as string;

  async function addMember(userId: string, role: "owner" | "coordinator" | "admin"): Promise<string> {
    const { data, error } = await admin.from("memberships").insert({ org_id: orgId, user_id: userId, role }).select("id").single();
    if (error || !data) throw new Error(`falha ao criar membership ${role}: ${error?.message}`);
    return data.id as string;
  }

  const ownerMembershipId = await addMember(ownerU.id, "owner");
  const coordMembershipId = await addMember(coordU.id, "coordinator");
  const adminMembershipId = await addMember(adminU.id, "admin");

  const { data: producao, error: prodError } = await admin
    .from("areas")
    .insert({ org_id: orgId, name: "Produção", coordinator_id: coordMembershipId })
    .select("id")
    .single();
  if (prodError || !producao) throw new Error(`falha ao criar área Produção: ${prodError?.message}`);

  const { data: comercial, error: comError } = await admin
    .from("areas")
    .insert({ org_id: orgId, name: "Comercial" })
    .select("id")
    .single();
  if (comError || !comercial) throw new Error(`falha ao criar área Comercial: ${comError?.message}`);

  const { data: objective, error: objError } = await admin
    .from("objectives")
    .insert({
      org_id: orgId,
      level: "monthly",
      type: "harvest",
      title: "Objetivo de teste E2E",
      result: "Resultado de teste",
      status: "on_track",
      period: "2026",
      area_id: producao.id,
      owner: "",
    })
    .select("id")
    .single();
  if (objError || !objective) throw new Error(`falha ao criar objetivo: ${objError?.message}`);

  return {
    orgId,
    label,
    owner: { id: ownerU.id, email: ownerU.email, password: TEST_PASSWORD, membershipId: ownerMembershipId, role: "owner" },
    coordinator: { id: coordU.id, email: coordU.email, password: TEST_PASSWORD, membershipId: coordMembershipId, role: "coordinator" },
    admin: { id: adminU.id, email: adminU.email, password: TEST_PASSWORD, membershipId: adminMembershipId, role: "admin" },
    areas: { producaoId: producao.id as string, comercialId: comercial.id as string },
    objectiveId: objective.id as string,
  };
}

// Apaga a org e todas as linhas escopadas por org_id com os gatilhos desligados
// (session_replication_role=replica). A limpeza defensiva não depende dos gatilhos que
// cada teste está exercitando. No CI, roda no PostgreSQL local; no staging
// hospedado, usa a Management API.
async function purgeOrgRows(orgId: string): Promise<void> {
  const sql = `do $$
declare t text;
begin
  set local session_replication_role = replica;
  for t in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables i
      on i.table_schema = c.table_schema and i.table_name = c.table_name
    where c.table_schema = 'public'
      and c.column_name = 'org_id'
      and i.table_type = 'BASE TABLE'
  loop
    execute format('delete from public.%I where org_id = %L', t, '${orgId}');
  end loop;
  delete from public.organizations where id = '${orgId}';
end $$;`;
  await runStagingSql(sql);
}

export async function destroyDisposableOrg(handle: DisposableOrg): Promise<void> {
  const admin = serviceClient();
  const errors: string[] = [];

  try {
    await purgeOrgRows(handle.orgId);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  for (const user of [handle.owner, handle.coordinator, handle.admin]) {
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) {
      const verification = await admin.auth.admin.getUserById(user.id);
      if (verification.data.user) errors.push(`usuário ${user.email}: ${error.message}`);
    }
  }

  const { data: still } = await admin.from("organizations").select("id").eq("id", handle.orgId).maybeSingle();
  if (still) errors.push(`org ${handle.orgId} ainda existe após a limpeza`);

  if (errors.length) {
    throw new Error(`LIMPEZA DA ORG DESCARTÁVEL FALHOU (${handle.label}): ${errors.join(" | ")}`);
  }
}
