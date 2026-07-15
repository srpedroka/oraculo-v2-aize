import { createHmac, randomBytes } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { anonClient, assertStaging, serviceClient } from "../tests/helpers/staging.ts";

const PRODUCTION_REF = "bkswkfazkjilwfzwzthz";
const STATE_PATH = resolve(".agents-private/master-test-7a.json");
const stagingUrl = process.env.SUPABASE_STAGING_URL ?? "";
const anonKey = process.env.SUPABASE_STAGING_ANON_KEY ?? "";

type UserKey = "ownerA" | "adminA" | "productionCoordinator" | "commercialCoordinator" | "ownerB";

interface TestUser {
  id: string;
  email: string;
  password: string;
}

interface MasterTestState {
  version: 1;
  runId: string;
  startedAt: string;
  stagingProjectRef: string;
  users: Record<UserKey, TestUser>;
  orgA: {
    id: string;
    name: string;
    memberships: Record<"owner" | "admin" | "productionCoordinator" | "commercialCoordinator", string>;
    areas: Record<"production" | "commercial", string>;
  };
  orgB: { id: string; name: string; ownerMembershipId: string };
  mfa: { factorId: string; secret: string };
  ai: { personCallsPerMinute: number; orgCallsPerMinute: number; monthlyBudgetUsd: number; mode: "monitor" };
  whatsapp: { mode: "synthetic_staging"; realInstanceConfigured: false };
}

interface CreatedResources {
  userIds: string[];
  orgIds: string[];
}

function stagingProjectRef() {
  if (!stagingUrl) throw new Error("SUPABASE_STAGING_URL ausente");
  const ref = new URL(stagingUrl).hostname.split(".")[0];
  if (!ref || ref === PRODUCTION_REF) throw new Error("RECUSADO: Teste Mestre nunca roda em produção");
  return ref;
}

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`variável ${name} ausente para o Teste Mestre`);
  return value;
}

async function runMasterSql(query: string) {
  const ref = stagingProjectRef();
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${required("SUPABASE_STAGING_ACCESS_TOKEN")}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  if (!response.ok) throw new Error(`SQL do Teste Mestre falhou (${response.status}): ${(await response.text()).slice(0, 300)}`);
}

function decodeBase32(value: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const char of value.replace(/=+$/g, "").toUpperCase()) {
    const index = alphabet.indexOf(char);
    if (index < 0) throw new Error("segredo TOTP inválido");
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }
  return Buffer.from(bytes);
}

function currentTotp(secret: string) {
  const counter = BigInt(Math.floor(Date.now() / 30_000));
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(counter);
  const digest = createHmac("sha1", decodeBase32(secret)).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24)
    | ((digest[offset + 1] & 0xff) << 16)
    | ((digest[offset + 2] & 0xff) << 8)
    | (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

async function callFunction(slug: string, token: string, body: Record<string, unknown>) {
  const response = await fetch(`${stagingUrl}/functions/v1/${slug}`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json() as Record<string, any>;
  if (!response.ok) throw new Error(`${slug} falhou (${response.status}): ${String(payload.error ?? "erro desconhecido")}`);
  return payload;
}

async function createUser(key: UserKey, runId: string, created: CreatedResources): Promise<TestUser> {
  const admin = serviceClient();
  const email = `master-${key.toLowerCase()}-${runId}@oraculo-e2e.invalid`;
  const password = `Oraculo-Master-${randomBytes(18).toString("base64url")}!`;
  const result = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (result.error || !result.data.user) throw new Error(`falha ao criar ${key}: ${result.error?.message}`);
  created.userIds.push(result.data.user.id);
  const profile = await admin.from("profiles").upsert({ id: result.data.user.id, full_name: `Master ${key}`, email });
  if (profile.error) throw new Error(`falha ao criar perfil ${key}: ${profile.error.message}`);
  return { id: result.data.user.id, email, password };
}

async function signIn(user: TestUser) {
  const client = anonClient();
  const result = await client.auth.signInWithPassword({ email: user.email, password: user.password });
  if (result.error || !result.data.session) throw new Error(`login de staging falhou: ${result.error?.message}`);
  return { client, session: result.data.session };
}

async function createOrganization(user: TestUser, name: string, token: string, created: CreatedResources) {
  const { session } = await signIn(user);
  const payload = await callFunction("create-organization", session.access_token, {
    name,
    subtitle: "Teste Mestre descartável",
    token,
  });
  const id = String(payload.org?.id ?? "");
  if (!id) throw new Error("create-organization não devolveu org.id");
  created.orgIds.push(id);
  return id;
}

async function membership(orgId: string, userId: string, role: "admin" | "coordinator") {
  const result = await serviceClient()
    .from("memberships")
    .insert({ org_id: orgId, user_id: userId, role })
    .select("id")
    .single();
  if (result.error || !result.data) throw new Error(`falha ao criar membership ${role}: ${result.error?.message}`);
  return String(result.data.id);
}

async function purgeOrganization(orgId: string) {
  await runMasterSql(`do $$
declare t text;
begin
  set local session_replication_role = replica;
  delete from public.organization_restore_runs where source_org_id = '${orgId}' or target_org_id = '${orgId}';
  for t in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables i on i.table_schema = c.table_schema and i.table_name = c.table_name
    where c.table_schema = 'public' and c.column_name = 'org_id' and i.table_type = 'BASE TABLE'
  loop
    execute format('delete from public.%I where org_id = %L', t, '${orgId}');
  end loop;
  delete from public.organizations where id = '${orgId}';
end $$;`);
}

async function cleanupResources(resources: CreatedResources) {
  const errors: string[] = [];
  for (const orgId of [...resources.orgIds].reverse()) {
    try {
      await purgeOrganization(orgId);
    } catch (error) {
      errors.push(`org ${orgId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const admin = serviceClient();
  for (const userId of [...resources.userIds].reverse()) {
    const result = await admin.auth.admin.deleteUser(userId);
    if (result.error) errors.push(`usuário ${userId}: ${result.error.message}`);
  }
  if (errors.length) throw new Error(`limpeza incompleta: ${errors.join(" | ")}`);
}

async function writeState(state: MasterTestState) {
  await mkdir(dirname(STATE_PATH), { recursive: true });
  await writeFile(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
}

async function readState() {
  return JSON.parse(await readFile(STATE_PATH, "utf8")) as MasterTestState;
}

async function setup() {
  assertStaging();
  const ref = stagingProjectRef();
  try {
    await readFile(STATE_PATH, "utf8");
    throw new Error(`já existe um Teste Mestre aberto em ${STATE_PATH}; use verify ou cleanup`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const runId = `${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${randomBytes(3).toString("hex")}`;
  const created: CreatedResources = { userIds: [], orgIds: [] };
  try {
    const users = {
      ownerA: await createUser("ownerA", runId, created),
      adminA: await createUser("adminA", runId, created),
      productionCoordinator: await createUser("productionCoordinator", runId, created),
      commercialCoordinator: await createUser("commercialCoordinator", runId, created),
      ownerB: await createUser("ownerB", runId, created),
    } satisfies Record<UserKey, TestUser>;

    const orgAName = `MASTER A ${runId}`;
    const orgBName = `MASTER B ${runId}`;
    const orgAId = await createOrganization(users.ownerA, orgAName, `master-a-${runId}`, created);
    const orgBId = await createOrganization(users.ownerB, orgBName, `master-b-${runId}`, created);
    const adminMembershipId = await membership(orgAId, users.adminA.id, "admin");
    const productionMembershipId = await membership(orgAId, users.productionCoordinator.id, "coordinator");
    const commercialMembershipId = await membership(orgAId, users.commercialCoordinator.id, "coordinator");

    const ownerMembership = await serviceClient()
      .from("memberships")
      .select("id")
      .eq("org_id", orgAId)
      .eq("user_id", users.ownerA.id)
      .single();
    const ownerBMembership = await serviceClient()
      .from("memberships")
      .select("id")
      .eq("org_id", orgBId)
      .eq("user_id", users.ownerB.id)
      .single();
    if (ownerMembership.error || ownerBMembership.error) throw new Error("memberships de owner não foram criadas");

    const areas = await serviceClient()
      .from("areas")
      .insert([
        { org_id: orgAId, name: "Produção", coordinator_id: productionMembershipId },
        { org_id: orgAId, name: "Comercial", coordinator_id: commercialMembershipId },
      ])
      .select("id, name");
    if (areas.error || areas.data?.length !== 2) throw new Error(`falha ao criar áreas: ${areas.error?.message}`);
    const productionArea = areas.data.find((area) => area.name === "Produção");
    const commercialArea = areas.data.find((area) => area.name === "Comercial");
    if (!productionArea || !commercialArea) throw new Error("áreas do Teste Mestre incompletas");

    const aiPolicy = { personCallsPerMinute: 5, orgCallsPerMinute: 20, monthlyBudgetUsd: 5, mode: "monitor" as const };
    const policy = await serviceClient().from("ai_control_policies").upsert({
      org_id: orgAId,
      person_calls_per_minute: aiPolicy.personCallsPerMinute,
      org_calls_per_minute: aiPolicy.orgCallsPerMinute,
      monthly_budget_usd: aiPolicy.monthlyBudgetUsd,
      enforcement_mode: aiPolicy.mode,
      updated_by: users.ownerA.id,
    });
    if (policy.error) throw new Error(`falha ao configurar controle de IA: ${policy.error.message}`);

    const ownerLogin = await signIn(users.ownerA);
    const enrollment = await ownerLogin.client.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `Teste Mestre ${runId}`,
      issuer: "Oráculo staging",
    });
    if (enrollment.error) throw enrollment.error;
    const challenge = await ownerLogin.client.auth.mfa.challenge({ factorId: enrollment.data.id });
    if (challenge.error) throw challenge.error;
    const verification = await ownerLogin.client.auth.mfa.verify({
      factorId: enrollment.data.id,
      challengeId: challenge.data.id,
      code: currentTotp(enrollment.data.totp.secret),
    });
    if (verification.error) throw verification.error;
    await callFunction("save-security-settings", verification.data.access_token, {
      orgId: orgAId,
      requireMfaForCriticalActions: true,
    });

    const state: MasterTestState = {
      version: 1,
      runId,
      startedAt: new Date().toISOString(),
      stagingProjectRef: ref,
      users,
      orgA: {
        id: orgAId,
        name: orgAName,
        memberships: {
          owner: String(ownerMembership.data.id),
          admin: adminMembershipId,
          productionCoordinator: productionMembershipId,
          commercialCoordinator: commercialMembershipId,
        },
        areas: { production: String(productionArea.id), commercial: String(commercialArea.id) },
      },
      orgB: { id: orgBId, name: orgBName, ownerMembershipId: String(ownerBMembership.data.id) },
      mfa: { factorId: enrollment.data.id, secret: enrollment.data.totp.secret },
      ai: aiPolicy,
      whatsapp: { mode: "synthetic_staging", realInstanceConfigured: false },
    };
    await writeState(state);
    console.log(JSON.stringify({
      ok: true,
      action: "setup",
      runId,
      stagingProjectRef: ref,
      organizations: [orgAName, orgBName],
      users: 5,
      mfa: "owner A only",
      whatsapp: "synthetic staging; no real instance",
      stateFile: STATE_PATH,
    }, null, 2));
  } catch (error) {
    await cleanupResources(created).catch((cleanupError) => {
      console.error(cleanupError instanceof Error ? cleanupError.message : String(cleanupError));
    });
    throw error;
  }
}

async function verify() {
  assertStaging();
  const state = await readState();
  if (state.stagingProjectRef !== stagingProjectRef()) throw new Error("estado pertence a outro staging");
  const admin = serviceClient();
  const memberships = await admin.from("memberships").select("id, user_id, role").eq("org_id", state.orgA.id);
  const areas = await admin.from("areas").select("id, name, coordinator_id").eq("org_id", state.orgA.id).is("archived_at", null);
  const kpisA = await admin.from("executive_kpis").select("id, kpi_key").eq("org_id", state.orgA.id);
  const kpisB = await admin.from("executive_kpis").select("id, kpi_key").eq("org_id", state.orgB.id);
  const aiSettings = await admin.from("ai_settings").select("org_id").in("org_id", [state.orgA.id, state.orgB.id]);
  const aiPolicy = await admin.from("ai_control_policies").select("*").eq("org_id", state.orgA.id).single();
  const security = await admin.from("organization_security_settings").select("require_mfa_for_critical_actions").eq("org_id", state.orgA.id).single();
  const whatsapp = await admin.from("whatsapp_settings").select("org_id").eq("org_id", state.orgA.id);
  const whatsappSecrets = await admin.from("whatsapp_instance_keys").select("org_id").eq("org_id", state.orgA.id);
  const queryError = memberships.error ?? areas.error ?? kpisA.error ?? kpisB.error ?? aiSettings.error ?? aiPolicy.error ?? security.error ?? whatsapp.error ?? whatsappSecrets.error;
  if (queryError) throw queryError;

  const ownerA = await signIn(state.users.ownerA);
  const ownOrg = await ownerA.client.from("organizations").select("id").eq("id", state.orgA.id);
  const crossOrg = await ownerA.client.from("organizations").select("id").eq("id", state.orgB.id);
  const crossKpis = await ownerA.client.from("executive_kpis").select("id").eq("org_id", state.orgB.id);
  const factors = await ownerA.client.auth.mfa.listFactors();

  const checks = {
    orgAMemberships: memberships.data?.length === 4,
    roles: ["admin", "coordinator", "coordinator", "owner"].every((role, index) =>
      [...(memberships.data ?? [])].map((row) => row.role).sort()[index] === role),
    areas: areas.data?.length === 2,
    fourKpisA: kpisA.data?.length === 4,
    fourKpisB: kpisB.data?.length === 4,
    aiSettings: aiSettings.data?.length === 2,
    aiMonitor: aiPolicy.data?.enforcement_mode === "monitor" && Number(aiPolicy.data?.monthly_budget_usd) === 5,
    mfaPolicy: security.data?.require_mfa_for_critical_actions === true,
    mfaFactor: factors.data?.totp.some((factor) => factor.id === state.mfa.factorId && factor.status === "verified") === true,
    whatsappInert: (whatsapp.data?.length ?? 0) === 0 && (whatsappSecrets.data?.length ?? 0) === 0,
    ownAccess: ownOrg.data?.length === 1,
    crossOrgDenied: (crossOrg.data?.length ?? 0) === 0 && (crossKpis.data?.length ?? 0) === 0,
  };
  const failed = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  if (failed.length) throw new Error(`baseline 7A falhou: ${failed.join(", ")}`);
  console.log(JSON.stringify({ ok: true, action: "verify", runId: state.runId, checks, stateFile: STATE_PATH }, null, 2));
}

async function cleanup() {
  assertStaging();
  const state = await readState();
  await cleanupResources({
    orgIds: [state.orgA.id, state.orgB.id],
    userIds: Object.values(state.users).map((user) => user.id),
  });
  await rm(STATE_PATH, { force: true });
  console.log(JSON.stringify({ ok: true, action: "cleanup", runId: state.runId }, null, 2));
}

const action = process.argv[2];
if (action === "setup") await setup();
else if (action === "verify") await verify();
else if (action === "cleanup") await cleanup();
else throw new Error("uso: pnpm run test:master:setup|verify|cleanup");
