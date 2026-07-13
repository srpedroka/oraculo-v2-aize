import { serviceClient } from "./auth.ts";

export function scheduleWhatsAppWorkerWake(
  client: ReturnType<typeof serviceClient>,
  orgId: string,
  correlationId: string,
) {
  const task = (async () => {
    const { data, error } = await client
      .from("whatsapp_worker_secrets")
      .select("worker_secret, endpoint_url")
      .eq("id", "worker")
      .maybeSingle();
    if (error || !data?.worker_secret || !data.endpoint_url) return;

    const expectedUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/whatsapp-worker`;
    if (data.endpoint_url !== expectedUrl) return;
    await fetch(data.endpoint_url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-oraculo-worker-secret": data.worker_secret,
      },
      body: JSON.stringify({ source: "webhook", orgId, correlationId, batchSize: 5 }),
    });
  })().catch(() => undefined);

  const runtime = (globalThis as unknown as { EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void } }).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(task);
  else void task;
}
