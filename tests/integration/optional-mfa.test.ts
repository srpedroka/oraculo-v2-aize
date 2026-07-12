import { createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDisposableOrg, destroyDisposableOrg, type DisposableOrg } from "../helpers/factory";
import { anonClient, hasStagingEnv, serviceClient } from "../helpers/staging";

const RUN = hasStagingEnv();
const d = RUN ? describe : describe.skip;
const stagingUrl = process.env.SUPABASE_STAGING_URL ?? "";
const anonKey = process.env.SUPABASE_STAGING_ANON_KEY ?? "";

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
  return { response, body: await response.json() as Record<string, unknown> };
}

d("Fatia 2D — MFA opcional para owners", () => {
  let org: DisposableOrg | null = null;
  const ownerClient = RUN ? anonClient() : null;
  let aal1Token = "";
  let aal2Token = "";

  beforeAll(async () => {
    org = await createDisposableOrg("2d-optional-mfa");
    const { data, error } = await ownerClient!.auth.signInWithPassword({
      email: org.owner.email,
      password: org.owner.password,
    });
    if (error || !data.session) throw error ?? new Error("sessão AAL1 não criada");
    aal1Token = data.session.access_token;
  }, 60_000);

  afterAll(async () => {
    if (org) await destroyDisposableOrg(org);
    org = null;
  }, 60_000);

  it("nasce desligada e não permite escrita direta pelo owner", async () => {
    const read = await ownerClient!
      .from("organization_security_settings")
      .select("require_mfa_for_critical_actions")
      .eq("org_id", org!.orgId)
      .maybeSingle();
    expect(read.error).toBeNull();
    expect(read.data).toBeNull();

    const directWrite = await ownerClient!.from("organization_security_settings").insert({
      org_id: org!.orgId,
      require_mfa_for_critical_actions: true,
    });
    expect(directWrite.error).not.toBeNull();
  });

  it("recusa ativação em AAL1, aceita após TOTP e elevação para AAL2", async () => {
    const blocked = await callFunction("save-security-settings", aal1Token, {
      orgId: org!.orgId,
      requireMfaForCriticalActions: true,
    });
    expect(blocked.response.status).toBe(403);
    expect(blocked.body.code).toBe("MFA_REQUIRED");

    const enrollment = await ownerClient!.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Integração 2D",
      issuer: "Oráculo staging",
    });
    if (enrollment.error) throw enrollment.error;
    const challenge = await ownerClient!.auth.mfa.challenge({ factorId: enrollment.data.id });
    if (challenge.error) throw challenge.error;
    const verification = await ownerClient!.auth.mfa.verify({
      factorId: enrollment.data.id,
      challengeId: challenge.data.id,
      code: currentTotp(enrollment.data.totp.secret),
    });
    if (verification.error) throw verification.error;
    aal2Token = verification.data.access_token;

    const enabled = await callFunction("save-security-settings", aal2Token, {
      orgId: org!.orgId,
      requireMfaForCriticalActions: true,
    });
    expect(enabled.response.status).toBe(200);
    expect(enabled.body.requireMfaForCriticalActions).toBe(true);
  });

  it("bloqueia ação crítica no servidor em AAL1 e permite em AAL2", async () => {
    const body = { orgId: org!.orgId, membershipId: org!.admin.membershipId, role: "admin" };
    const blocked = await callFunction("set-member-role", aal1Token, body);
    expect(blocked.response.status).toBe(403);
    expect(blocked.body.code).toBe("MFA_REQUIRED");

    const allowed = await callFunction("set-member-role", aal2Token, body);
    expect(allowed.response.status).toBe(200);
    expect(allowed.body.ok).toBe(true);
  });

  it("RLS também fecha o atalho direto de papel e configurações em AAL1", async () => {
    const aal1Client = anonClient();
    const signIn = await aal1Client.auth.signInWithPassword({
      email: org!.owner.email,
      password: org!.owner.password,
    });
    if (signIn.error) throw signIn.error;
    const aal = await aal1Client.auth.mfa.getAuthenticatorAssuranceLevel();
    expect(aal.data?.currentLevel).toBe("aal1");

    const roleWrite = await aal1Client
      .from("memberships")
      .update({ role: "coordinator" })
      .eq("id", org!.admin.membershipId)
      .select("role");
    expect(roleWrite.error).toBeNull();
    expect(roleWrite.data).toEqual([]);

    const whatsappWrite = await aal1Client
      .from("whatsapp_settings")
      .update({ enabled: false })
      .eq("org_id", org!.orgId)
      .select("enabled");
    expect(whatsappWrite.error).toBeNull();
    expect(whatsappWrite.data).toEqual([]);

    const unchangedRole = await serviceClient()
      .from("memberships")
      .select("role")
      .eq("id", org!.admin.membershipId)
      .single();
    expect(unchangedRole.data?.role).toBe("admin");
  });

  it("membro lê a política, mas não consegue alterá-la", async () => {
    const coordinator = anonClient();
    const signIn = await coordinator.auth.signInWithPassword({
      email: org!.coordinator.email,
      password: org!.coordinator.password,
    });
    if (signIn.error) throw signIn.error;
    const read = await coordinator
      .from("organization_security_settings")
      .select("require_mfa_for_critical_actions")
      .eq("org_id", org!.orgId)
      .single();
    expect(read.error).toBeNull();
    expect(read.data?.require_mfa_for_critical_actions).toBe(true);

    const write = await coordinator
      .from("organization_security_settings")
      .update({ require_mfa_for_critical_actions: false })
      .eq("org_id", org!.orgId);
    expect(write.error).not.toBeNull();
  });

  it("service role mantém acesso operacional para enforcement", async () => {
    const row = await serviceClient()
      .from("organization_security_settings")
      .select("require_mfa_for_critical_actions, enabled_by")
      .eq("org_id", org!.orgId)
      .single();
    expect(row.error).toBeNull();
    expect(row.data?.require_mfa_for_critical_actions).toBe(true);
    expect(row.data?.enabled_by).toBe(org!.owner.id);
  });
});
