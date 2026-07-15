import postgres from "postgres";
import { assertStaging } from "./staging";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variavel ${name} ausente para executar SQL de teste`);
  return value;
}

function isLocalStaging(): boolean {
  const url = required("SUPABASE_STAGING_URL");
  const hostname = new URL(url).hostname;
  return hostname === "127.0.0.1" || hostname === "localhost";
}

export async function runStagingSql(query: string): Promise<unknown> {
  assertStaging();

  if (isLocalStaging()) {
    const sql = postgres(required("SUPABASE_STAGING_DB_URL"), {
      max: 1,
      connect_timeout: 10,
      idle_timeout: 2,
    });
    try {
      return await sql.unsafe(query);
    } finally {
      await sql.end({ timeout: 2 });
    }
  }

  const ref = required("SUPABASE_STAGING_PROJECT_REF");
  const token = required("SUPABASE_STAGING_ACCESS_TOKEN");
  const endpoint = `https://api.supabase.com/v1/projects/${ref}/database/query`;

  const retryDelays = [1_000, 2_000, 5_000, 10_000, 20_000];
  for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      if (response.ok) return response.json();

      const responseBody = await response.text();
      const contentType = response.headers.get("content-type") ?? "";
      const transient = response.status === 408 || response.status === 429 || response.status >= 500 || contentType.includes("text/html");
      if (!transient || attempt === retryDelays.length) {
        throw new Error(`SQL de staging falhou: ${responseBody.slice(0, 300)}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const transportFailure = /fetch failed|network error|connection reset|timed out/i.test(message);
      if (!transportFailure || attempt === retryDelays.length) throw error;
    }

    await new Promise((resolve) => setTimeout(resolve, retryDelays[attempt]));
  }

  throw new Error("SQL de staging terminou sem resposta");
}
