import { describe, it, expect } from "vitest";
import { hasStagingEnv, serviceClient } from "../helpers/staging";
import { createDisposableOrg, destroyDisposableOrg } from "../helpers/factory";

describe.skipIf(!hasStagingEnv())("fábrica de organização descartável (staging)", () => {
  it("cria e remove uma organização descartável", async () => {
    const org = await createDisposableOrg("factory");
    let existed = false;

    try {
      const admin = serviceClient();
      const { data } = await admin.from("organizations").select("id, name").eq("id", org.orgId).maybeSingle();
      existed = Boolean(data);
      expect(data?.name).toContain("E2E Oraculo");

      const { count: areas } = await admin.from("areas").select("id", { count: "exact", head: true }).eq("org_id", org.orgId);
      expect(areas).toBe(2);

      const { count: members } = await admin.from("memberships").select("id", { count: "exact", head: true }).eq("org_id", org.orgId);
      expect(members).toBe(3);

      const { count: objectives } = await admin.from("objectives").select("id", { count: "exact", head: true }).eq("org_id", org.orgId);
      expect(objectives).toBe(1);
    } finally {
      await destroyDisposableOrg(org);
    }

    // Comprova que a limpeza removeu a organização.
    const admin = serviceClient();
    const { data: gone } = await admin.from("organizations").select("id").eq("id", org.orgId).maybeSingle();
    expect(existed).toBe(true);
    expect(gone).toBeNull();
  });
});
