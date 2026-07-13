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
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!response.ok) throw new Error(`SQL de staging falhou: ${(await response.text()).slice(0, 300)}`);
  return response.json();
}
