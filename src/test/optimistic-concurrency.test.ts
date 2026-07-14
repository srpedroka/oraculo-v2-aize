import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { conflictMessage, isStaleWriteError, STALE_WRITE_MESSAGE } from "../lib/optimisticConcurrency";

const migration = readFileSync("supabase/migrations/20260714223000_optimistic_concurrency.sql", "utf8");

describe("Fatia 5F / concorrência otimista", () => {
  it("reconhece conflitos do Postgres e das Edge Functions", () => {
    expect(isStaleWriteError({ code: "40001" })).toBe(true);
    expect(isStaleWriteError({ code: "CONFLICT_STALE_WRITE" })).toBe(true);
    expect(conflictMessage({ message: "CONFLICT_STALE_WRITE" }, "fallback")).toBe(STALE_WRITE_MESSAGE);
    expect(conflictMessage(new Error("outro erro"), "fallback")).toBe("outro erro");
  });

  it("mantém objetivo por compare-and-swap e KPI em uma transação", () => {
    expect(migration).toContain("objectives_touch_version");
    expect(migration).toContain("save_kpi_editor_if_current");
    expect(migration).toContain("with input_rows as materialized");
    expect(migration).toContain("'conflict', not exists (select 1 from updated_kpi)");
    expect(migration).not.toContain("for value_item");
  });

  it("protege WhatsApp e segredos na mesma função transacional", () => {
    expect(migration).toContain("save_whatsapp_settings_if_current");
    expect(migration).toContain("whatsapp_instance_keys");
    expect(migration).toContain("revoke all on function public.save_whatsapp_settings_if_current");
    expect(migration).toContain("to service_role");
    expect(migration).toContain("save_ai_function_if_current");
  });
});
