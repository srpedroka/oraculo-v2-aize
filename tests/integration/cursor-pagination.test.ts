import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDisposableOrg, destroyDisposableOrg, type DisposableOrg } from "../helpers/factory";
import { anonClient, hasStagingEnv, serviceClient } from "../helpers/staging";

const RUN = hasStagingEnv();
const d = RUN ? describe : describe.skip;
let org: DisposableOrg | null = null;
let ownerClient: ReturnType<typeof anonClient> | null = null;

d("Fatia 5C - paginacao cursor-based", () => {
  beforeAll(async () => {
    org = await createDisposableOrg("5c-cursor-pagination");
    ownerClient = anonClient();
    const { error: signInError } = await ownerClient.auth.signInWithPassword({
      email: org.owner.email,
      password: org.owner.password,
    });
    if (signInError) throw signInError;

    const createdAt = "2026-07-13T20:00:00.000Z";
    const rows = Array.from({ length: 35 }, (_, index) => ({
      org_id: org!.orgId,
      area_id: org!.areas.producaoId,
      type: "monthly",
      period: "Jul 2026",
      title: `Documento paginado ${String(index + 1).padStart(2, "0")}`,
      content: { schemaVersion: 1, index },
      created_by: org!.owner.id,
      created_at: createdAt,
    }));
    const { error } = await serviceClient().from("plan_documents").insert(rows);
    if (error) throw error;
  }, 60_000);

  afterAll(async () => {
    await ownerClient?.auth.signOut();
    if (org) await destroyDisposableOrg(org);
  }, 60_000);

  it("le 30 + 5 sem repeticao e respeita filtros server-side", async () => {
    const first = await ownerClient!
      .from("plan_documents")
      .select("id,created_at,area_id,period")
      .eq("org_id", org!.orgId)
      .eq("area_id", org!.areas.producaoId)
      .eq("period", "Jul 2026")
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(30);
    if (first.error) throw first.error;
    expect(first.data).toHaveLength(30);

    const cursor = first.data[29];
    const second = await ownerClient!
      .from("plan_documents")
      .select("id,created_at,area_id,period")
      .eq("org_id", org!.orgId)
      .eq("area_id", org!.areas.producaoId)
      .eq("period", "Jul 2026")
      .is("archived_at", null)
      .or(`created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(30);
    if (second.error) throw second.error;

    expect(second.data).toHaveLength(5);
    const ids = [...first.data, ...second.data].map((row) => row.id);
    expect(new Set(ids).size).toBe(35);
    expect([...first.data, ...second.data].every((row) => row.area_id === org!.areas.producaoId && row.period === "Jul 2026")).toBe(true);
  });
});
