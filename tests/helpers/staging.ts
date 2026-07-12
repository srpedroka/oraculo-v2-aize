import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Clientes para testes de integração/segurança. Usam SOMENTE o Supabase de staging.
// As credenciais vêm de variáveis de ambiente (carregar .agents-private/agent-env local
// ou secrets de CI). Nunca são versionadas.

const PRODUCTION_REF = "bkswkfazkjilwfzwzthz";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Variável ${name} ausente. Os testes de integração/segurança usam SOMENTE o Supabase de staging. ` +
        `Carregue .agents-private/agent-env antes de rodar.`,
    );
  }
  return value;
}

export function hasStagingEnv(): boolean {
  return Boolean(
    process.env.SUPABASE_STAGING_URL &&
      process.env.SUPABASE_STAGING_ANON_KEY &&
      process.env.SUPABASE_STAGING_SERVICE_ROLE_KEY,
  );
}

// Trava dura: recusa rodar se a URL apontar para produção.
export function assertStaging(): void {
  const url = required("SUPABASE_STAGING_URL");
  if (url.includes(PRODUCTION_REF)) {
    throw new Error("RECUSADO: a URL de teste aponta para PRODUÇÃO. Testes só podem rodar no staging.");
  }
}

export function serviceClient(): SupabaseClient {
  assertStaging();
  return createClient(required("SUPABASE_STAGING_URL"), required("SUPABASE_STAGING_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function anonClient(): SupabaseClient {
  assertStaging();
  return createClient(required("SUPABASE_STAGING_URL"), required("SUPABASE_STAGING_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
