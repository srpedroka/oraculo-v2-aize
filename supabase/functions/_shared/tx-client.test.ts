import { describe, expect, it } from "vitest";
import { TxClient, proposalCommandKey } from "./tx-client.ts";

// Transacao falsa: registra cada query e devolve linhas canned na ordem enfileirada.
function fakeTx(cannedRows: any[][] = []) {
  const calls: { text: string; args: any[] }[] = [];
  const queue = [...cannedRows];
  const tx = {
    queryObject: (spec: { text: string; args: any[] }) => {
      calls.push({ text: spec.text.replace(/\s+/g, " ").trim(), args: spec.args });
      return Promise.resolve({ rows: queue.shift() ?? [] });
    },
  };
  return { tx, calls };
}

describe("TxClient builder — INSERT", () => {
  it("insert().select().single() gera jsonb_populate_record com RETURNING e mapeia 1 linha", async () => {
    const { tx, calls } = fakeTx([[{ id: "obj-1", title: "X" }]]);
    const client = new TxClient(tx as any);
    const { data, error } = await client.from("objectives").insert({ title: "X", area_id: null }).select("*").single();
    expect(error).toBeNull();
    expect(data).toEqual({ id: "obj-1", title: "X" });
    expect(calls[0].text).toBe(
      'insert into "objectives" ("title", "area_id") select "title", "area_id" from jsonb_populate_record(null::"objectives", $1::jsonb) returning *',
    );
    expect(JSON.parse(calls[0].args[0])).toEqual({ title: "X", area_id: null });
  });

  it("insert() sem select() nao usa RETURNING e retorna data null", async () => {
    const { tx, calls } = fakeTx([[]]);
    const client = new TxClient(tx as any);
    const { data, error } = await client.from("strategic_projects").insert({ name: "P" });
    expect(error).toBeNull();
    expect(data).toBeNull();
    expect(calls[0].text).not.toContain("returning");
  });
});

describe("TxClient builder — UPSERT", () => {
  it("upsert com onConflict gera ON CONFLICT DO UPDATE SET das colunas nao-conflito", async () => {
    const { tx, calls } = fakeTx([[{ id: "p1" }]]);
    const client = new TxClient(tx as any);
    await client.from("strategic_plans").upsert({ org_id: "o1", year: 2026, themes: ["a"] }, { onConflict: "org_id,year" }).select("*").single();
    expect(calls[0].text).toContain('on conflict ("org_id", "year") do update set "themes" = excluded."themes"');
    expect(calls[0].text).not.toContain('"org_id" = excluded');
  });

  it("upsert de multiplas linhas usa jsonb_populate_recordset", async () => {
    const { tx, calls } = fakeTx([[]]);
    const client = new TxClient(tx as any);
    await client.from("objective_kpi_links").upsert(
      [{ objective_id: "o1", kpi_id: "k1" }, { objective_id: "o1", kpi_id: "k2" }],
      { onConflict: "objective_id,kpi_id" },
    );
    expect(calls[0].text).toContain("jsonb_populate_recordset");
    expect(JSON.parse(calls[0].args[0])).toHaveLength(2);
  });
});

describe("TxClient builder — UPDATE", () => {
  it("update().eq() qualifica o WHERE em tgt e le do registro s", async () => {
    const { tx, calls } = fakeTx([[{ id: "s1", pending_proposal: null }]]);
    const client = new TxClient(tx as any);
    await client.from("planning_sessions").update({ pending_proposal: null, status: "completed" }).eq("id", "s1").select("*").single();
    const sql = calls[0].text;
    expect(sql).toContain('update "planning_sessions" as tgt set "pending_proposal" = s."pending_proposal", "status" = s."status"');
    expect(sql).toContain('from jsonb_populate_record(null::"planning_sessions", $1::jsonb) as s');
    expect(sql).toContain('where "tgt"."id" = $2');
    expect(sql).toContain("returning tgt.*");
    expect(calls[0].args[1]).toBe("s1");
  });
});

describe("TxClient builder — SELECT/filtros", () => {
  it("select com eq/is-null/order/limit + maybeSingle", async () => {
    const { tx, calls } = fakeTx([[{ id: "d1" }]]);
    const client = new TxClient(tx as any);
    const { data } = await client.from("plan_documents").select("*").eq("org_id", "o1").is("archived_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
    expect(data).toEqual({ id: "d1" });
    const sql = calls[0].text;
    expect(sql).toBe('select * from "plan_documents" where "org_id" = $1 and "archived_at" is null order by "created_at" desc limit 1');
  });

  it("maybeSingle com zero linhas devolve null sem erro", async () => {
    const { tx } = fakeTx([[]]);
    const client = new TxClient(tx as any);
    const { data, error } = await client.from("areas").select("*").eq("id", "x").maybeSingle();
    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  it("single com numero de linhas != 1 retorna erro", async () => {
    const { tx } = fakeTx([[{ a: 1 }, { a: 2 }]]);
    const client = new TxClient(tx as any);
    const { data, error } = await client.from("t").select("*").eq("x", 1).single();
    expect(data).toBeNull();
    expect(error).toBeTruthy();
  });

  it("ilike() vira col ilike $n", async () => {
    const { tx, calls } = fakeTx([[]]);
    const client = new TxClient(tx as any);
    await client.from("objectives").select("*").eq("org_id", "o1").is("archived_at", null).ilike("title", "Pai Trimestral");
    expect(calls[0].text).toContain('"title" ilike $2');
    expect(calls[0].args[1]).toBe("Pai Trimestral");
  });

  it("in() vira = any($n)", async () => {
    const { tx, calls } = fakeTx([[]]);
    const client = new TxClient(tx as any);
    await client.from("executive_kpis").select("*").in("kpi_key", ["revenue", "cash"]);
    expect(calls[0].text).toContain('"kpi_key" = any($1)');
    expect(calls[0].args[0]).toEqual(["revenue", "cash"]);
  });
});

describe("TxClient — serializacao de concorrencia", () => {
  it("Promise.all roda as queries em ordem, uma de cada vez", async () => {
    const order: string[] = [];
    const tx = {
      queryObject: async (spec: { text: string; args: any[] }) => {
        const tag = spec.args[0];
        order.push(`start:${tag}`);
        await new Promise((r) => setTimeout(r, tag === "A" ? 20 : 1));
        order.push(`end:${tag}`);
        return { rows: [] };
      },
    };
    const client = new TxClient(tx as any);
    await Promise.all([
      client.from("t").select("*").eq("k", "A"),
      client.from("t").select("*").eq("k", "B"),
    ]);
    // Sem serializacao, "B" terminaria antes de "A". Com fila, A completa antes de B iniciar.
    expect(order).toEqual(["start:A", "end:A", "start:B", "end:B"]);
  });
});

describe("proposalCommandKey — determinismo e sensibilidade a conteudo", () => {
  it("mesma proposta => mesma chave; ordem de campos nao importa", async () => {
    const a = await proposalCommandKey("s1", "save_monthly_plan", { type: "save_monthly_plan", objectives: [{ title: "X", owner: "Y" }] }, "u1");
    const b = await proposalCommandKey("s1", "save_monthly_plan", { objectives: [{ owner: "Y", title: "X" }], type: "save_monthly_plan" }, "u1");
    expect(a.idempotencyKey).toBe(b.idempotencyKey);
    expect(a.requestHash).toBe(b.requestHash);
  });

  it("conteudo diferente => chave diferente", async () => {
    const a = await proposalCommandKey("s1", "save_monthly_plan", { type: "save_monthly_plan", n: 1 }, "u1");
    const b = await proposalCommandKey("s1", "save_monthly_plan", { type: "save_monthly_plan", n: 2 }, "u1");
    expect(a.idempotencyKey).not.toBe(b.idempotencyKey);
  });

  it("sessao diferente => chave diferente mesmo com mesmo conteudo", async () => {
    const a = await proposalCommandKey("s1", "save_monthly_plan", { type: "save_monthly_plan", n: 1 }, "u1");
    const b = await proposalCommandKey("s2", "save_monthly_plan", { type: "save_monthly_plan", n: 1 }, "u1");
    expect(a.idempotencyKey).not.toBe(b.idempotencyKey);
    expect(a.requestHash).toBe(b.requestHash); // hash de conteudo e o mesmo
  });
});
