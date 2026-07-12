// Lógica pura (testável) dos verificadores de deploy.
// Fica separada do script executável para poder ser testada sem rede.

// Funções que ficam SEM verificação de JWT no gateway (webhook/cron). Elas autenticam
// cron ou usuário DENTRO da função. Qualquer outra função deve exigir JWT (verify_jwt=true).
export const PUBLIC_FUNCTIONS = [
  "whatsapp-webhook",
  "month-turn",
  "weekly-pulse",
  "deadline-nudges",
  "organization-backup",
] as const;

export interface FunctionInfo {
  slug: string;
  verify_jwt: boolean;
}

export type FunctionJwtConfig = Record<string, boolean>;

export function isExpectedPublic(slug: string): boolean {
  return (PUBLIC_FUNCTIONS as readonly string[]).includes(slug);
}

// Retorna a lista de problemas de verify_jwt. Vazia = tudo certo.
export function verifyJwtIssues(functions: FunctionInfo[]): string[] {
  const issues: string[] = [];
  for (const fn of functions) {
    if (isExpectedPublic(fn.slug) && fn.verify_jwt) {
      issues.push(`${fn.slug}: deveria ser público (verify_jwt=false), mas está com verify_jwt=true`);
    }
    if (!isExpectedPublic(fn.slug) && !fn.verify_jwt) {
      issues.push(`${fn.slug}: deveria exigir JWT (verify_jwt=true), mas está com verify_jwt=false`);
    }
  }
  return issues;
}

export function parseFunctionJwtConfig(source: string): FunctionJwtConfig {
  const config: FunctionJwtConfig = {};
  let currentFunction: string | null = null;

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+#.*$/, "").trim();
    const section = line.match(/^\[functions\.([a-z0-9-]+)\]$/i);
    if (section) {
      currentFunction = section[1];
      continue;
    }
    if (line.startsWith("[")) {
      currentFunction = null;
      continue;
    }
    const jwt = line.match(/^verify_jwt\s*=\s*(true|false)$/i);
    if (currentFunction && jwt) config[currentFunction] = jwt[1].toLowerCase() === "true";
  }

  return config;
}

export function functionConfigIssues(localSlugs: string[], source: string): string[] {
  const config = parseFunctionJwtConfig(source);
  const local = new Set(localSlugs);
  const issues: string[] = [];

  for (const slug of localSlugs) {
    if (!(slug in config)) {
      issues.push(`${slug}: ausente de supabase/config.toml`);
      continue;
    }
    const expected = !isExpectedPublic(slug);
    if (config[slug] !== expected) {
      issues.push(`${slug}: config.toml deveria ter verify_jwt=${expected}`);
    }
  }
  for (const slug of Object.keys(config)) {
    if (!local.has(slug)) issues.push(`${slug}: declarado no config.toml, mas sem diretório de função`);
  }

  return issues;
}

export function functionDeploymentIssues(localSlugs: string[], functions: FunctionInfo[]): string[] {
  const local = new Set(localSlugs);
  const remote = new Set(functions.map((fn) => fn.slug));
  const issues = localSlugs.filter((slug) => !remote.has(slug)).map((slug) => `${slug}: ausente no ambiente remoto`);
  for (const slug of remote) {
    if (!local.has(slug)) issues.push(`${slug}: publicada no remoto, mas ausente do repositório`);
  }
  return issues;
}

// Compara migrations locais versus versões aplicadas no remoto.
export function migrationDrift(localVersions: string[], remoteVersions: string[]): {
  pendentes: string[];
  soNoRemoto: string[];
} {
  const remote = new Set(remoteVersions);
  const local = new Set(localVersions);
  return {
    pendentes: localVersions.filter((v) => !remote.has(v)),
    soNoRemoto: remoteVersions.filter((v) => !local.has(v)),
  };
}
