import { afterEach, describe, expect, it } from "vitest";
import { createDisposableOrg, destroyDisposableOrg, type DisposableOrg } from "../helpers/factory";
import { hasStagingEnv, serviceClient } from "../helpers/staging";

const RUN = hasStagingEnv();
const d = RUN ? describe : describe.skip;
const admin = RUN ? serviceClient() : (null as any);

let org: DisposableOrg | null = null;

d("Fatia 2A.0 — fila de backup durante exclusões", () => {
  afterEach(async () => {
    if (org) await destroyDisposableOrg(org);
    org = null;
  }, 60_000);

  it("continua enfileirando backup quando um registro da empresa é excluído", async () => {
    org = await createDisposableOrg("2a0-child-delete");

    const { error: clearError } = await admin
      .from("organization_backup_requests")
      .delete()
      .eq("org_id", org.orgId);
    expect(clearError).toBeNull();

    const { error: deleteError } = await admin
      .from("objectives")
      .delete()
      .eq("id", org.objectiveId)
      .eq("org_id", org.orgId);
    expect(deleteError).toBeNull();

    const { data: request, error: requestError } = await admin
      .from("organization_backup_requests")
      .select("org_id, reason")
      .eq("org_id", org.orgId)
      .maybeSingle();
    expect(requestError).toBeNull();
    expect(request).toEqual({ org_id: org.orgId, reason: "objectives" });
  });

  it("permite apagar uma organização populada sem a FK da fila bloquear o cascade", async () => {
    org = await createDisposableOrg("2a0-populated-org-delete");

    const { error: aiSettingsError } = await admin
      .from("ai_settings")
      .insert({ org_id: org.orgId });
    expect(aiSettingsError).toBeNull();

    const { error: documentError } = await admin.from("plan_documents").insert({
      org_id: org.orgId,
      area_id: org.areas.producaoId,
      type: "monthly",
      origin: "historical",
      period: "Jul 2026",
      title: "Documento parcial de restauração",
      content: { raw: "Conteúdo descartável para testar cleanup." },
      version: 1,
      created_by: org.owner.id,
    });
    expect(documentError).toBeNull();

    const { error: deleteError } = await admin
      .from("organizations")
      .delete()
      .eq("id", org.orgId);
    expect(deleteError).toBeNull();

    const { data: deletedOrg, error: lookupError } = await admin
      .from("organizations")
      .select("id")
      .eq("id", org.orgId)
      .maybeSingle();
    expect(lookupError).toBeNull();
    expect(deletedOrg).toBeNull();

    const { count: staleRequests, error: requestError } = await admin
      .from("organization_backup_requests")
      .select("org_id", { count: "exact", head: true })
      .eq("org_id", org.orgId);
    expect(requestError).toBeNull();
    expect(staleRequests).toBe(0);
  });
});

