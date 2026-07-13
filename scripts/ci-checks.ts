export interface SecretFinding {
  path: string;
  rule: string;
}

const SECRET_PATTERNS: Array<{ rule: string; pattern: RegExp }> = [
  { rule: "private-key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { rule: "supabase-personal-token", pattern: /sbp_[A-Za-z0-9]{24,}/ },
  { rule: "provider-api-key", pattern: /(?:sk|xai)-[A-Za-z0-9_-]{28,}/ },
  { rule: "github-token", pattern: /gh[pousr]_[A-Za-z0-9]{30,}/ },
  { rule: "aws-access-key", pattern: /AKIA[0-9A-Z]{16}/ },
  { rule: "jwt", pattern: /eyJ[A-Za-z0-9_-]{18,}\.[A-Za-z0-9_-]{18,}\.[A-Za-z0-9_-]{18,}/ },
];

const SAFE_MARKERS = ["placeholder", "example", "change-me", "your_", "<", "ci-local-only"];

export function isForbiddenTrackedPath(path: string): boolean {
  const normalized = path.toLowerCase();
  if (normalized === ".env.example") return false;
  if (normalized === ".env" || normalized.startsWith(".env.")) return true;
  return /\.(?:pem|p12|pfx|key|dump|sql\.gz|zip)$/.test(normalized);
}

export function findSecretFindings(path: string, content: string): SecretFinding[] {
  const findings: SecretFinding[] = [];
  if (isForbiddenTrackedPath(path)) findings.push({ path, rule: "forbidden-sensitive-file" });

  for (const line of content.split(/\r?\n/)) {
    const lower = line.toLowerCase();
    if (SAFE_MARKERS.some((marker) => lower.includes(marker))) continue;
    for (const { rule, pattern } of SECRET_PATTERNS) {
      if (pattern.test(line)) findings.push({ path, rule });
    }
  }

  return [...new Map(findings.map((finding) => [`${finding.path}:${finding.rule}`, finding])).values()];
}

export function secretValuesFromEnv(env: NodeJS.ProcessEnv): string[] {
  return Object.entries(env)
    .filter(([name, value]) => /(?:secret|token|password|service_role|api_key|private_key)/i.test(name) && (value?.length ?? 0) >= 8)
    .map(([, value]) => value as string)
    .sort((a, b) => b.length - a.length);
}

export function sanitizeCiOutput(value: string, secretValues: string[] = []): string {
  let sanitized = value;
  for (const secret of secretValues) sanitized = sanitized.split(secret).join("[REDACTED]");
  return sanitized
    .replace(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g, "[REDACTED_PRIVATE_KEY]")
    .replace(/(?:sbp_|gh[pousr]_)[A-Za-z0-9_-]{20,}/g, "[REDACTED_TOKEN]")
    .replace(/(?:sk|xai)-[A-Za-z0-9_-]{20,}/g, "[REDACTED_API_KEY]")
    .replace(/eyJ[A-Za-z0-9_-]{18,}\.[A-Za-z0-9_-]{18,}\.[A-Za-z0-9_-]{18,}/g, "[REDACTED_JWT]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED_EMAIL]");
}
