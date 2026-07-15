import { describe, expect, it } from "vitest";
import { createDisposableOrg, destroyDisposableOrg, type DisposableOrg } from "../helpers/factory";
import { anonClient, hasStagingEnv, serviceClient } from "../helpers/staging";

async function fingerprint(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

describe.skipIf(!hasStagingEnv())("conta pessoal e desligamento (staging)", () => {
  it("bloqueia a exclusão do último owner no próprio banco", async () => {
    let org: DisposableOrg | null = null;
    try {
      org = await createDisposableOrg("personal-last-owner");
      const client = serviceClient();

      const { error } = await client.auth.admin.deleteUser(org.owner.id);
      expect(error).toBeTruthy();

      const [{ data: user }, { data: membership }] = await Promise.all([
        client.auth.admin.getUserById(org.owner.id),
        client.from("memberships").select("id").eq("id", org.owner.membershipId).maybeSingle(),
      ]);
      expect(user.user?.id).toBe(org.owner.id);
      expect(membership?.id).toBe(org.owner.membershipId);
    } finally {
      if (org) await destroyDisposableOrg(org);
    }
  });

  it("apaga Auth/perfil permitido e preserva o histórico empresarial anonimizado", async () => {
    let org: DisposableOrg | null = null;
    try {
      org = await createDisposableOrg("personal-anonymize");
      const client = serviceClient();
      const conversationId = crypto.randomUUID();
      const sessionId = crypto.randomUUID();
      const documentId = crypto.randomUUID();
      const evidenceId = crypto.randomUUID();
      const requestId = crypto.randomUUID();

      const { error: promoteError } = await client.from("memberships").update({ role: "owner" }).eq("id", org.coordinator.membershipId);
      if (promoteError) throw promoteError;

      const inserts = await Promise.all([
        client.from("conversations").insert({
          id: conversationId, org_id: org.orgId, user_id: org.owner.id, channel: "web", status: "archived",
        }),
        client.from("evidences").insert({
          id: evidenceId, org_id: org.orgId, objective_id: org.objectiveId, text: "Histórico preservado", created_by: org.owner.id,
        }),
        client.from("plan_documents").insert({
          id: documentId, org_id: org.orgId, type: "strategic", period: "2026", title: "Documento preservado",
          content: { summary: "Conteúdo empresarial" }, created_by: org.owner.id,
        }),
        client.from("organization_lifecycle_audit").insert({
          org_id: org.orgId, org_name: org.label, action: "leave", actor_user_id: org.owner.id,
          actor_email: org.owner.email, reason: "teste",
        }),
        client.from("personal_data_requests").insert({
          id: requestId, user_id: org.owner.id, subject_fingerprint: "a".repeat(64), request_type: "export", status: "completed",
        }),
      ]);
      for (const result of inserts) if (result.error) throw result.error;

      const { error: sessionError } = await client.from("planning_sessions").insert({
        id: sessionId, org_id: org.orgId, user_id: org.owner.id, conversation_id: conversationId,
        type: "strategic", period: "2026", phase: "completed", status: "completed",
      });
      if (sessionError) throw sessionError;

      const { error: deleteError } = await client.auth.admin.deleteUser(org.owner.id);
      if (deleteError) throw deleteError;

      const [profile, membership, organization, conversation, session, evidence, document, audit, request] = await Promise.all([
        client.from("profiles").select("id").eq("id", org.owner.id).maybeSingle(),
        client.from("memberships").select("id").eq("id", org.owner.membershipId).maybeSingle(),
        client.from("organizations").select("id, created_by").eq("id", org.orgId).single(),
        client.from("conversations").select("id, user_id").eq("id", conversationId).single(),
        client.from("planning_sessions").select("id, user_id").eq("id", sessionId).single(),
        client.from("evidences").select("id, created_by, text").eq("id", evidenceId).single(),
        client.from("plan_documents").select("id, created_by, title").eq("id", documentId).single(),
        client.from("organization_lifecycle_audit").select("actor_user_id, actor_email, metadata").eq("org_id", org.orgId).eq("reason", "teste").single(),
        client.from("personal_data_requests").select("user_id, subject_fingerprint").eq("id", requestId).single(),
      ]);

      expect(profile.data).toBeNull();
      expect(membership.data).toBeNull();
      expect(organization.data).toMatchObject({ id: org.orgId, created_by: null });
      expect(conversation.data).toMatchObject({ id: conversationId, user_id: null });
      expect(session.data).toMatchObject({ id: sessionId, user_id: null });
      expect(evidence.data).toMatchObject({ id: evidenceId, created_by: null, text: "Histórico preservado" });
      expect(document.data).toMatchObject({ id: documentId, created_by: null, title: "Documento preservado" });
      expect(audit.data).toMatchObject({ actor_user_id: null, actor_email: null, metadata: { actorAnonymized: true } });
      expect(request.data).toMatchObject({ user_id: null, subject_fingerprint: "a".repeat(64) });
    } finally {
      if (org) await destroyDisposableOrg(org);
    }
  });

  it("remove o telefone ao apagar o último vínculo e o preserva quando ainda há outro", async () => {
    let first: DisposableOrg | null = null;
    let second: DisposableOrg | null = null;
    try {
      first = await createDisposableOrg("personal-phone-a");
      second = await createDisposableOrg("personal-phone-b");
      const client = serviceClient();
      const phone = "+5546999999001";

      const { error: profileError } = await client.from("profiles").update({ phone }).eq("id", first.admin.id);
      if (profileError) throw profileError;
      const { error: linkError } = await client.from("memberships").insert({
        org_id: second.orgId, user_id: first.admin.id, role: "admin",
      });
      if (linkError) throw linkError;

      const { error: firstRemoval } = await client.rpc("remove_organization_member", {
        p_org_id: first.orgId, p_membership_id: first.admin.membershipId, p_area_reassignments: {},
      });
      if (firstRemoval) throw firstRemoval;
      const { data: stillLinked } = await client.from("profiles").select("phone").eq("id", first.admin.id).single();
      expect(stillLinked?.phone).toBe(phone);

      const { data: finalMembership } = await client.from("memberships").select("id").eq("org_id", second.orgId).eq("user_id", first.admin.id).single();
      const { error: finalRemoval } = await client.rpc("remove_organization_member", {
        p_org_id: second.orgId, p_membership_id: finalMembership!.id, p_area_reassignments: {},
      });
      if (finalRemoval) throw finalRemoval;
      const { data: unlinked } = await client.from("profiles").select("phone").eq("id", first.admin.id).single();
      expect(unlinked?.phone).toBeNull();
    } finally {
      if (first) await destroyDisposableOrg(first);
      if (second) await destroyDisposableOrg(second);
    }
  });

  it("exporta pela Function somente o escopo pessoal acessível", async () => {
    let org: DisposableOrg | null = null;
    try {
      org = await createDisposableOrg("personal-export-function");
      const auth = anonClient();
      const { error: signInError } = await auth.auth.signInWithPassword({
        email: org.coordinator.email, password: org.coordinator.password,
      });
      if (signInError) throw signInError;

      const { data, error } = await auth.functions.invoke("personal-account", { body: { action: "export" } });
      if (error) throw error;
      expect(data.ok).toBe(true);
      expect(data.data).toMatchObject({
        format: "oraculo-personal-data-v1",
        account: { id: org.coordinator.id, email: org.coordinator.email },
      });
      expect(data.data.memberships).toHaveLength(1);
      expect(JSON.stringify(data.data)).not.toContain(org.owner.email);

      const { data: request } = await serviceClient()
        .from("personal_data_requests")
        .select("status, result_summary")
        .eq("user_id", org.coordinator.id)
        .eq("request_type", "export")
        .order("requested_at", { ascending: false })
        .limit(1)
        .single();
      expect(request?.status).toBe("completed");
      expect(request?.result_summary).toMatchObject({ memberships: 1, organizations: 1 });
    } finally {
      if (org) await destroyDisposableOrg(org);
    }
  });

  it("exige email correto na Function e conclui a exclusão permitida", async () => {
    let org: DisposableOrg | null = null;
    try {
      org = await createDisposableOrg("personal-delete-function");
      const auth = anonClient();
      const { error: signInError } = await auth.auth.signInWithPassword({
        email: org.admin.email, password: org.admin.password,
      });
      if (signInError) throw signInError;

      const wrong = await auth.functions.invoke("personal-account", {
        body: { action: "delete", confirmEmail: "outro@oraculo.invalid", finalConfirmation: true },
      });
      expect(wrong.error).toBeTruthy();
      expect((await serviceClient().auth.admin.getUserById(org.admin.id)).data.user?.id).toBe(org.admin.id);

      const success = await auth.functions.invoke("personal-account", {
        body: { action: "delete", confirmEmail: org.admin.email, finalConfirmation: true },
      });
      if (success.error) throw success.error;
      expect(success.data).toMatchObject({ ok: true, deleted: true });

      const client = serviceClient();
      const subjectFingerprint = await fingerprint(org.admin.id);
      const [{ data: removedUser }, { data: removedMembership }, { data: requests }] = await Promise.all([
        client.auth.admin.getUserById(org.admin.id),
        client.from("memberships").select("id").eq("id", org.admin.membershipId).maybeSingle(),
        client.from("personal_data_requests").select("user_id, status").eq("subject_fingerprint", subjectFingerprint).order("requested_at"),
      ]);
      expect(removedUser.user).toBeNull();
      expect(removedMembership).toBeNull();
      expect(requests).toEqual([
        { user_id: null, status: "blocked" },
        { user_id: null, status: "completed" },
      ]);
    } finally {
      if (org) await destroyDisposableOrg(org);
    }
  });
});
