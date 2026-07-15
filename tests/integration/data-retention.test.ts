import { describe, expect, it } from "vitest";
import { anonClient, hasStagingEnv, serviceClient } from "../helpers/staging";
import { createDisposableOrg, destroyDisposableOrg, type DisposableOrg } from "../helpers/factory";
import { runStagingSql } from "../helpers/sql";

describe.skipIf(!hasStagingEnv())("retenção técnica automática (staging)", () => {
  it("remove somente dados técnicos vencidos e preserva itens recentes, pendentes e memória estratégica", async () => {
    let org: DisposableOrg | null = null;
    let retentionRunId: string | null = null;
    try {
      org = await createDisposableOrg("data-retention");
      const oldConversationId = crypto.randomUUID();

      await runStagingSql(`
        insert into public.whatsapp_inbound_jobs
          (org_id, event_key, phone, kind, payload, status, expires_at, created_at, updated_at, completed_at)
        values
          ('${org.orgId}', 'retention-inbound-old', '+5546999999999', 'text', '{}'::jsonb, 'completed', now() - interval '39 days', now() - interval '40 days', now() - interval '40 days', now() - interval '40 days'),
          ('${org.orgId}', 'retention-inbound-recent', '+5546999999999', 'text', '{}'::jsonb, 'completed', now() + interval '1 day', now(), now(), now());

        insert into public.whatsapp_outbox
          (org_id, correlation_id, destination, content, status, created_at, updated_at, sent_at)
        values
          ('${org.orgId}', gen_random_uuid(), '+5546999999999', 'retention-outbox-old', 'sent', now() - interval '40 days', now() - interval '40 days', now() - interval '40 days'),
          ('${org.orgId}', gen_random_uuid(), '+5546999999999', 'retention-outbox-recent', 'sent', now(), now(), now());

        insert into public.whatsapp_processed_events (org_id, event_key, created_at)
        values
          ('${org.orgId}', 'retention-processed-old', now() - interval '40 days'),
          ('${org.orgId}', 'retention-processed-recent', now());

        insert into public.deadline_nudge_log (org_id, membership_id, sent_on, item_count, created_at)
        values
          ('${org.orgId}', '${org.owner.membershipId}', current_date - 200, 1, now() - interval '200 days'),
          ('${org.orgId}', '${org.admin.membershipId}', current_date, 1, now());

        insert into public.weekly_pulse_log (org_id, membership_id, week_start, sent_at)
        values
          ('${org.orgId}', '${org.owner.membershipId}', current_date - 203, now() - interval '200 days'),
          ('${org.orgId}', '${org.admin.membershipId}', current_date, now());

        insert into public.operational_health_snapshots (org_id, status, metrics, checked_at)
        values
          ('${org.orgId}', 'healthy', '{}'::jsonb, now() - interval '40 days'),
          ('${org.orgId}', 'healthy', '{}'::jsonb, now());

        insert into public.frontend_error_events (org_id, occurrence_id, error_code, path, created_at)
        values
          ('${org.orgId}', 'ORC-AAAAAAAAAA', 'RETENTION_TEST', '/teste', now() - interval '100 days'),
          ('${org.orgId}', 'ORC-BBBBBBBBBB', 'RETENTION_TEST', '/teste', now());

        insert into public.ai_function_errors (org_id, function, provider, model, error_code, created_at)
        values
          ('${org.orgId}', 'daily', 'openai', 'test-model', 'RETENTION_TEST', now() - interval '100 days'),
          ('${org.orgId}', 'daily', 'openai', 'test-model', 'RETENTION_TEST', now());

        insert into public.operational_alerts
          (org_id, code, tone, title, detail, first_seen_at, last_seen_at, resolved_at)
        values
          ('${org.orgId}', 'retention-resolved-old', 'warning', 'Teste', 'Teste', now() - interval '100 days', now() - interval '100 days', now() - interval '100 days'),
          ('${org.orgId}', 'retention-open-old', 'warning', 'Teste', 'Teste', now() - interval '100 days', now() - interval '100 days', null);

        insert into public.operation_commands
          (org_id, operation, idempotency_key, request_hash, status, created_at, completed_at)
        values
          ('${org.orgId}', 'retention-test', 'old-completed', 'hash', 'completed', now() - interval '400 days', now() - interval '400 days'),
          ('${org.orgId}', 'retention-test', 'old-processing', 'hash', 'processing', now() - interval '400 days', null);

        insert into public.ai_usage_logs
          (org_id, provider, model, channel, created_at)
        values
          ('${org.orgId}', 'openai', 'test-model', 'system', now() - interval '800 days'),
          ('${org.orgId}', 'openai', 'test-model', 'system', now());

        insert into public.ai_limit_events
          (org_id, kind, scope_key, period_key, observed_value, limit_value, enforcement_mode, created_at)
        values
          ('${org.orgId}', 'org_rate', 'retention-old', 'old', 1, 1, 'monitor', now() - interval '800 days'),
          ('${org.orgId}', 'org_rate', 'retention-recent', 'recent', 1, 1, 'monitor', now());

        insert into public.conversations
          (id, org_id, user_id, channel, status, last_message_at, created_at)
        values
          ('${oldConversationId}', '${org.orgId}', '${org.owner.id}', 'web', 'archived', now() - interval '800 days', now() - interval '800 days');
      `);

      const owner = anonClient();
      const signedIn = await owner.auth.signInWithPassword({ email: org.owner.email, password: org.owner.password });
      expect(signedIn.error).toBeNull();
      const forbiddenPreview = await owner.rpc("preview_expired_technical_data");
      expect(forbiddenPreview.error).not.toBeNull();
      const hiddenRuns = await owner.from("data_retention_runs").select("id");
      expect(hiddenRuns.error).not.toBeNull();
      await owner.auth.signOut();

      const service = serviceClient();
      const preview = await service.rpc("preview_expired_technical_data");
      expect(preview.error).toBeNull();
      expect(Number(preview.data?.whatsapp_inbound_jobs)).toBeGreaterThanOrEqual(1);
      expect(Number(preview.data?.ai_usage_logs)).toBeGreaterThanOrEqual(1);

      const cleanup = await service.rpc("cleanup_expired_technical_data");
      expect(cleanup.error).toBeNull();
      expect(cleanup.data?.status).toBe("completed");

      const retentionRun = await service
        .from("data_retention_runs")
        .select("id, policy_version, deleted_counts")
        .order("executed_at", { ascending: false })
        .limit(1)
        .single();
      expect(retentionRun.error).toBeNull();
      retentionRunId = retentionRun.data?.id ?? null;
      expect(retentionRun.data?.policy_version).toBe("2026-07-15-r2");
      expect(retentionRun.data?.deleted_counts).not.toHaveProperty("content");

      const checks = await Promise.all([
        service.from("whatsapp_inbound_jobs").select("event_key").eq("org_id", org.orgId),
        service.from("whatsapp_outbox").select("content").eq("org_id", org.orgId),
        service.from("whatsapp_processed_events").select("event_key").eq("org_id", org.orgId),
        service.from("operational_alerts").select("code").eq("org_id", org.orgId),
        service.from("operation_commands").select("idempotency_key").eq("org_id", org.orgId),
        service.from("ai_usage_logs").select("created_at").eq("org_id", org.orgId),
        service.from("ai_limit_events").select("scope_key").eq("org_id", org.orgId),
        service.from("conversations").select("id").eq("id", oldConversationId),
        service.from("objectives").select("id").eq("id", org.objectiveId),
      ]);

      checks.forEach((check) => expect(check.error).toBeNull());
      expect(checks[0].data?.map((row) => row.event_key)).toEqual(["retention-inbound-recent"]);
      expect(checks[1].data?.map((row) => row.content)).toEqual(["retention-outbox-recent"]);
      expect(checks[2].data?.map((row) => row.event_key)).toEqual(["retention-processed-recent"]);
      expect(checks[3].data?.map((row) => row.code)).toEqual(["retention-open-old"]);
      expect(checks[4].data?.map((row) => row.idempotency_key)).toEqual(["old-processing"]);
      expect(checks[5].data).toHaveLength(1);
      expect(checks[6].data?.map((row) => row.scope_key)).toEqual(["retention-recent"]);
      expect(checks[7].data).toHaveLength(1);
      expect(checks[8].data).toHaveLength(1);
    } finally {
      if (retentionRunId) {
        await serviceClient().from("data_retention_runs").delete().eq("id", retentionRunId);
      }
      if (org) await destroyDisposableOrg(org);
    }
  });
});
