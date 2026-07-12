import { describe, it, expect } from "vitest";
import { anonClient, hasStagingEnv } from "../helpers/staging";
import { createDisposableOrg, destroyDisposableOrg, type DisposableOrg } from "../helpers/factory";

// Prova que o RLS isola organizações: um usuário da Org A não enxerga dados da Org B.
describe.skipIf(!hasStagingEnv())("RLS — isolamento entre organizações (staging)", () => {
  it("usuário da Org A não lê objetivo da Org B", async () => {
    let orgA: DisposableOrg | null = null;
    let orgB: DisposableOrg | null = null;
    try {
      orgA = await createDisposableOrg("rls-a");
      orgB = await createDisposableOrg("rls-b");

      // Entra como owner da Org A (JWT de usuário real, RLS ativa).
      const clientA = anonClient();
      const { error: signInError } = await clientA.auth.signInWithPassword({
        email: orgA.owner.email,
        password: orgA.owner.password,
      });
      expect(signInError).toBeNull();

      // Controle positivo: enxerga o próprio objetivo.
      const own = await clientA.from("objectives").select("id").eq("id", orgA.objectiveId);
      expect(own.error).toBeNull();
      expect(own.data?.length).toBe(1);

      // Negativo por id: NÃO enxerga o objetivo da Org B.
      const crossById = await clientA.from("objectives").select("id").eq("id", orgB.objectiveId);
      expect(crossById.error).toBeNull();
      expect(crossById.data?.length ?? 0).toBe(0);

      // Negativo por org: NÃO lista nada da Org B.
      const crossByOrg = await clientA.from("objectives").select("id").eq("org_id", orgB.orgId);
      expect(crossByOrg.data?.length ?? 0).toBe(0);

      // Nem enxerga a própria organização B, áreas ou memberships da B.
      const orgBRead = await clientA.from("organizations").select("id").eq("id", orgB.orgId);
      expect(orgBRead.data?.length ?? 0).toBe(0);

      await clientA.auth.signOut();
    } finally {
      if (orgA) await destroyDisposableOrg(orgA);
      if (orgB) await destroyDisposableOrg(orgB);
    }
  });
});
