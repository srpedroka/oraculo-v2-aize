import { describe, expect, it } from "vitest";
import { anonClient, hasStagingEnv, serviceClient } from "../helpers/staging";
import { createDisposableOrg, destroyDisposableOrg, type DisposableOrg } from "../helpers/factory";
import { runStagingSql } from "../helpers/sql";

const NOTICE_VERSION = "2026-07-15-r2";

describe.skipIf(!hasStagingEnv())("ciência versionada do aviso de dados (staging)", () => {
  it("permite ciência somente pelo owner, mantém leitura na empresa e isola outras organizações", async () => {
    let orgA: DisposableOrg | null = null;
    let orgB: DisposableOrg | null = null;
    try {
      orgA = await createDisposableOrg("data-notice-a");
      orgB = await createDisposableOrg("data-notice-b");

      const coordinator = anonClient();
      const coordinatorSignIn = await coordinator.auth.signInWithPassword({
        email: orgA.coordinator.email,
        password: orgA.coordinator.password,
      });
      expect(coordinatorSignIn.error).toBeNull();
      const forbiddenInsert = await coordinator
        .from("organization_data_notice_acknowledgements")
        .insert({ org_id: orgA.orgId, notice_version: NOTICE_VERSION });
      expect(forbiddenInsert.error).not.toBeNull();
      await coordinator.auth.signOut();

      const service = serviceClient();
      const promoted = await service
        .from("memberships")
        .update({ role: "owner" })
        .eq("id", orgA.coordinator.membershipId);
      expect(promoted.error).toBeNull();

      const acceptingOwner = anonClient();
      const acceptingOwnerSignIn = await acceptingOwner.auth.signInWithPassword({
        email: orgA.coordinator.email,
        password: orgA.coordinator.password,
      });
      expect(acceptingOwnerSignIn.error).toBeNull();
      const forgedAcceptance = await acceptingOwner
        .from("organization_data_notice_acknowledgements")
        .insert({
          org_id: orgA.orgId,
          notice_version: NOTICE_VERSION,
          accepted_by: orgA.owner.id,
          accepted_at: "2000-01-01T00:00:00Z",
        });
      expect(forgedAcceptance.error).not.toBeNull();
      const accepted = await acceptingOwner
        .from("organization_data_notice_acknowledgements")
        .insert({ org_id: orgA.orgId, notice_version: NOTICE_VERSION })
        .select("org_id, notice_version, accepted_by")
        .single();
      expect(accepted.error).toBeNull();
      expect(accepted.data).toMatchObject({
        org_id: orgA.orgId,
        notice_version: NOTICE_VERSION,
        accepted_by: orgA.coordinator.id,
      });

      const forbiddenDelete = await acceptingOwner
        .from("organization_data_notice_acknowledgements")
        .delete()
        .eq("org_id", orgA.orgId);
      expect(forbiddenDelete.error).not.toBeNull();
      await acceptingOwner.auth.signOut();

      const ownerRead = anonClient();
      await ownerRead.auth.signInWithPassword({ email: orgA.owner.email, password: orgA.owner.password });
      const ownOrgRead = await ownerRead
        .from("organization_data_notice_acknowledgements")
        .select("org_id")
        .eq("org_id", orgA.orgId);
      expect(ownOrgRead.error).toBeNull();
      expect(ownOrgRead.data).toHaveLength(1);
      await ownerRead.auth.signOut();

      const ownerB = anonClient();
      await ownerB.auth.signInWithPassword({ email: orgB.owner.email, password: orgB.owner.password });
      const crossOrgRead = await ownerB
        .from("organization_data_notice_acknowledgements")
        .select("org_id")
        .eq("org_id", orgA.orgId);
      expect(crossOrgRead.error).toBeNull();
      expect(crossOrgRead.data).toHaveLength(0);
      await ownerB.auth.signOut();

      await runStagingSql(`delete from auth.users where id = '${orgA.coordinator.id}'`);
      const anonymizedAudit = await service
        .from("organization_data_notice_acknowledgements")
        .select("accepted_by")
        .eq("org_id", orgA.orgId)
        .eq("notice_version", NOTICE_VERSION)
        .single();
      expect(anonymizedAudit.error).toBeNull();
      expect(anonymizedAudit.data?.accepted_by).toBeNull();
    } finally {
      if (orgA) await destroyDisposableOrg(orgA);
      if (orgB) await destroyDisposableOrg(orgB);
    }
  });
});
