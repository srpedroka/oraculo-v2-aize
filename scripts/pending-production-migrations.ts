import { readdirSync } from "node:fs";

const PROJECT_REF = "bkswkfazkjilwfzwzthz";
const token = process.env.SUPABASE_ACCESS_TOKEN;

if (!token) {
  console.error("SUPABASE_ACCESS_TOKEN ausente no ambiente protegido.");
  process.exit(2);
}

const response = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query: "select version from supabase_migrations.schema_migrations order by version" }),
});

if (!response.ok) {
  console.error(`Falha ao consultar migrations aplicadas: HTTP ${response.status}`);
  process.exit(1);
}

const remote = new Set(((await response.json()) as Array<{ version: string }>).map((row) => row.version));
const pending = readdirSync("supabase/migrations")
  .filter((file) => file.endsWith(".sql") && !remote.has(file.slice(0, 14)))
  .sort();

for (const file of pending) console.log(`supabase/migrations/${file}`);
