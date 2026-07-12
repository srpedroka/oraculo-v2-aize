// Verificador de deploy — SOMENTE LEITURA. Confere o estado de produção antes/depois
// de publicar, sem alterar nada. Uso: `pnpm run verify:deploy` (precisa de
// SUPABASE_ACCESS_TOKEN de produção no ambiente).
import { readdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { verifyJwtIssues, migrationDrift, PUBLIC_FUNCTIONS, type FunctionInfo } from "./deploy-checks.ts";

const PROD_REF = "bkswkfazkjilwfzwzthz";
const FRONTEND_URL = "https://oraculo-v2-aize.netlify.app";
const token = process.env.SUPABASE_ACCESS_TOKEN;

const problems: string[] = [];
const notes: string[] = [];

function line(ok: boolean, label: string, detail = "") {
  console.log(`${ok ? "✅" : "❌"} ${label}${detail ? ` — ${detail}` : ""}`);
}

async function mgmt(path: string, body?: unknown) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROD_REF}${path}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function main() {
  if (!token) {
    console.error("SUPABASE_ACCESS_TOKEN ausente (produção). Carregue .agents-private/agent-env.");
    process.exit(2);
  }

  // 1. Funções + verify_jwt
  const functions = (await mgmt("/functions")) as Array<{ slug: string; verify_jwt: boolean }>;
  const infos: FunctionInfo[] = functions.map((f) => ({ slug: f.slug, verify_jwt: f.verify_jwt }));
  const jwtIssues = verifyJwtIssues(infos);
  line(jwtIssues.length === 0, `Edge Functions: ${functions.length} publicadas, verify_jwt`, jwtIssues.length ? jwtIssues.join("; ") : "todas corretas");
  problems.push(...jwtIssues);
  notes.push(`públicas esperadas: ${PUBLIC_FUNCTIONS.join(", ")}`);

  // 2. Migrations locais vs remotas
  const localVersions = readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).map((f) => f.slice(0, 14)).sort();
  const remoteRows = (await mgmt("/database/query", { query: "select version from supabase_migrations.schema_migrations order by version" })) as Array<{ version: string }>;
  const drift = migrationDrift(localVersions, remoteRows.map((r) => r.version));
  const migOk = drift.pendentes.length === 0 && drift.soNoRemoto.length === 0;
  line(migOk, `Migrations: ${localVersions.length} locais / ${remoteRows.length} aplicadas`, migOk ? "em dia" : `pendentes: [${drift.pendentes.join(",")}] só-no-remoto: [${drift.soNoRemoto.join(",")}]`);
  if (drift.pendentes.length) problems.push(`migrations pendentes de aplicar: ${drift.pendentes.join(", ")}`);

  // 3. Frontend no ar
  const front = await fetch(FRONTEND_URL, { method: "GET" });
  line(front.ok, `Frontend ${FRONTEND_URL}`, `HTTP ${front.status}`);
  if (!front.ok) problems.push(`frontend respondeu HTTP ${front.status}`);

  // 4. Segredos fora do Git
  let ignored = false;
  try {
    ignored = execSync("git check-ignore .agents-private/agent-env", { encoding: "utf8" }).trim().length > 0;
  } catch {
    ignored = false;
  }
  let leaked = "";
  try {
    leaked = execSync("git grep -I -l -E 'sbp_[a-f0-9]{40}|SERVICE_ROLE_KEY=ey' -- . ':!*.md' || true", { encoding: "utf8" }).trim();
  } catch {
    leaked = "";
  }
  const secretsOk = ignored && !leaked;
  line(secretsOk, "Segredos fora do Git", ignored ? (leaked ? `POSSÍVEL VAZAMENTO em: ${leaked}` : ".agents-private ignorado, nada versionado") : ".agents-private NÃO está ignorado");
  if (!ignored) problems.push(".agents-private/agent-env não está gitignored");
  if (leaked) problems.push(`possível segredo versionado em: ${leaked}`);

  console.log("");
  if (problems.length) {
    console.error(`❌ ${problems.length} problema(s):\n- ${problems.join("\n- ")}`);
    process.exit(1);
  }
  console.log("✅ Deploy verificado: nenhum problema.");
  if (notes.length) console.log(notes.map((n) => `   · ${n}`).join("\n"));
}

main().catch((error) => {
  console.error("Falha no verificador:", error instanceof Error ? error.message : error);
  process.exit(2);
});
