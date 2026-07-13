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
  "whatsapp-worker",
] as const;

export interface FunctionInfo {
  slug: string;
  verify_jwt: boolean;
}

export type FunctionJwtConfig = Record<string, boolean>;
export type HeaderValues = Record<string, string | null | undefined>;

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

function normalizedHeaders(headers: HeaderValues): HeaderValues {
  return Object.fromEntries(Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]));
}

export function securityHeaderIssues(headers: HeaderValues): string[] {
  const values = normalizedHeaders(headers);
  const issues: string[] = [];
  const csp = values["content-security-policy"] ?? "";
  const requiredCsp = [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "script-src 'self'",
    "connect-src 'self' https://bkswkfazkjilwfzwzthz.supabase.co wss://bkswkfazkjilwfzwzthz.supabase.co",
    "worker-src 'self' blob:",
  ];
  for (const directive of requiredCsp) {
    if (!csp.includes(directive)) issues.push(`CSP sem ${directive}`);
  }
  if (csp.includes("'unsafe-eval'")) issues.push("CSP permite unsafe-eval");
  if (values["x-frame-options"]?.toUpperCase() !== "DENY") issues.push("X-Frame-Options deve ser DENY");
  if (values["x-content-type-options"]?.toLowerCase() !== "nosniff") issues.push("X-Content-Type-Options deve ser nosniff");
  if (values["referrer-policy"]?.toLowerCase() !== "strict-origin-when-cross-origin") {
    issues.push("Referrer-Policy deve ser strict-origin-when-cross-origin");
  }
  const permissions = values["permissions-policy"] ?? "";
  for (const blocked of ["camera=()", "geolocation=()", "microphone=()", "payment=()", "usb=()"]) {
    if (!permissions.includes(blocked)) issues.push(`Permissions-Policy sem ${blocked}`);
  }
  if (!(values["strict-transport-security"] ?? "").includes("max-age=31536000")) {
    issues.push("HSTS deve ter max-age de pelo menos um ano");
  }
  return issues;
}

export function htmlCacheIssues(cacheControl: string | null | undefined): string[] {
  const value = cacheControl?.toLowerCase() ?? "";
  return value.includes("max-age=0") && value.includes("must-revalidate")
    ? []
    : ["HTML deve usar max-age=0, must-revalidate"];
}

export function assetCacheIssues(cacheControl: string | null | undefined): string[] {
  const value = cacheControl?.toLowerCase() ?? "";
  return value.includes("max-age=31536000") && value.includes("immutable")
    ? []
    : ["assets com hash devem usar max-age=31536000, immutable"];
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
