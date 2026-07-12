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
