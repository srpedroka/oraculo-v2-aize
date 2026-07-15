import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260715220000_disaster_recovery.sql", "utf8");
const backupSource = readFileSync("supabase/functions/_shared/organization-backup.ts", "utf8");
const backupFunction = readFileSync("supabase/functions/organization-backup/index.ts", "utf8");
const healthFunction = readFileSync("supabase/functions/operational-health/index.ts", "utf8");
const backupCard = readFileSync("src/features/backups/OrganizationBackupCard.tsx", "utf8");

describe("Fatia 6F — recuperação de desastre", () => {
  it("enfileira toda tabela durável exportada sem criar loop na política de backup", () => {
    const exportedTables = [...backupSource.matchAll(/table: "([a-z0-9_]+)"/g)].map((match) => match[1]);
    const rpoTables = exportedTables.filter((table) => table !== "organization_backup_policies");

    expect(rpoTables.length).toBeGreaterThan(20);
    for (const table of rpoTables) expect(migration, table).toContain(`'${table}'`);
    expect(migration).not.toMatch(/'organization_backup_policies'[\s\S]*create trigger queue_organization_backup/);
    expect(migration).toContain("least(organization_backup_requests.requested_at, excluded.requested_at)");
  });

  it("força o exercício trimestral a ler a réplica externa", () => {
    expect(backupFunction).toContain('exerciseType === "disaster_drill" ? "external"');
    expect(backupSource).toContain('if (source === "external")');
    expect(backupSource).toContain("downloadExternal(backup.external_object_key)");
  });

  it("mede a restauração e verifica contagens, secrets e WhatsApp", () => {
    expect(backupSource).toContain("verifyRestoredOrganization(");
    expect(backupSource).toContain("criticalCountsMatch");
    expect(backupSource).toContain("secretsExcluded");
    expect(backupSource).toContain("whatsappDisabled");
    expect(backupSource).toContain("duration_ms: durationMs");
  });

  it("não chama cópia externa antiga de protegida", () => {
    expect(backupFunction).toContain("externalAgeMinutes > 26 * 60");
    expect(backupFunction).toContain("backupAgeMinutes > 26 * 60");
  });

  it("mantém incidentes estruturados, sem texto livre ou conteúdo de negócio", () => {
    expect(migration).toContain("create table if not exists public.organization_recovery_incidents");
    expect(migration).toContain("affected_services text[]");
    expect(migration).not.toMatch(/organization_recovery_incidents[\s\S]{0,900}\b(summary|notes|description|content|message)\s+text\b/i);
    expect(healthFunction).toContain("INCIDENT_SERVICES");
    expect(healthFunction).toContain("recovery_incident_opened");
  });

  it("atualiza a contagem esperada de migrations do monitor", () => {
    expect(healthFunction).toContain("EXPECTED_MIGRATION_COUNT = 49");
  });

  it("atualiza o seletor de empresas ao criar ou remover o clone", () => {
    expect(backupCard).toContain('queryKey: ["memberships"]');
    expect(backupCard).toContain('queryKey: ["organizations"]');

    const discardMutation = backupCard.match(/const discardDrillMutation[\s\S]*?const deleteMutation/)?.[0] ?? "";
    expect(discardMutation).toContain("await invalidateOrganizationAccess()");
  });
});
