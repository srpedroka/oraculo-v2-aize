import { execFileSync, spawnSync } from "node:child_process";

const PROJECT_REF = "bkswkfazkjilwfzwzthz";
const KEYCHAIN_SERVICE = "com.oraculo.supabase.production";
const KEYCHAIN_ACCOUNT = PROJECT_REF;
const FUNCTION_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function readProductionToken(): string {
  if (process.env.SUPABASE_ACCESS_TOKEN) {
    fail(
      "RECUSADO: SUPABASE_ACCESS_TOKEN já está carregado no ambiente. " +
        "Remova-o do agent-env e use o acesso protegido do Chaves.",
    );
  }

  try {
    const token = execFileSync(
      "/usr/bin/security",
      ["find-generic-password", "-a", KEYCHAIN_ACCOUNT, "-s", KEYCHAIN_SERVICE, "-w"],
      { encoding: "utf8", stdio: ["inherit", "pipe", "inherit"] },
    ).trim();
    if (!token) fail("A credencial autorizada pelo Chaves está vazia.");
    return token;
  } catch {
    fail(
      "Credencial de produção indisponível ou não autorizada. " +
        "Consulte o acesso de emergência em docs/RUNBOOK.md.",
    );
  }
}

function run(command: string, args: string[], token: string): never {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: { ...process.env, SUPABASE_ACCESS_TOKEN: token },
  });
  process.exit(result.status ?? 1);
}

const [action, ...args] = process.argv.slice(2);

if (action === "verify" && args.length === 0) {
  run("pnpm", ["run", "verify:deploy"], readProductionToken());
}

if (action === "functions") {
  if (args.length === 0 || args.some((name) => !FUNCTION_NAME.test(name))) {
    fail("Informe somente nomes explícitos de Edge Functions, por exemplo: oracle-chat whatsapp-worker");
  }

  const dirty = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim();
  if (dirty) fail("RECUSADO: o worktree precisa estar limpo antes de publicar produção.");

  run(
    "pnpm",
    [
      "dlx",
      "supabase@2.109.1",
      "functions",
      "deploy",
      ...args,
      "--project-ref",
      PROJECT_REF,
      "--use-api",
    ],
    readProductionToken(),
  );
}

fail("Uso: pnpm run production:verify | pnpm run production:functions -- <function ...>");
