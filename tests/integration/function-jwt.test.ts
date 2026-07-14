import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDisposableOrg, destroyDisposableOrg, type DisposableOrg } from "../helpers/factory";
import { anonClient, hasStagingEnv } from "../helpers/staging";

const RUN = hasStagingEnv();
const d = RUN ? describe : describe.skip;
const FUNCTIONS = ["invite-member", "save-ai-settings", "save-whatsapp-settings"] as const;
const stagingUrl = process.env.SUPABASE_STAGING_URL ?? "";
const anonKey = process.env.SUPABASE_STAGING_ANON_KEY ?? "";

let org: DisposableOrg | null = null;
let accessToken = "";

async function callFunction(slug: string, authorization?: string, includeApiKey = true) {
  return fetch(`${stagingUrl}/functions/v1/${slug}`, {
    method: "POST",
    headers: {
      ...(includeApiKey ? { apikey: anonKey } : {}),
      "content-type": "application/json",
      ...(authorization ? { authorization: `Bearer ${authorization}` } : {}),
    },
    body: "{}",
  });
}

d("Fatia 2B — JWT no gateway das funções administrativas", () => {
  beforeAll(async () => {
    org = await createDisposableOrg("2b-function-jwt");
    const { data, error } = await anonClient().auth.signInWithPassword({
      email: org.owner.email,
      password: org.owner.password,
    });
    if (error || !data.session?.access_token) throw error ?? new Error("Sessão de staging não criada");
    accessToken = data.session.access_token;
  }, 60_000);

  afterAll(async () => {
    if (org) await destroyDisposableOrg(org);
    org = null;
  }, 60_000);

  it.each(FUNCTIONS)("%s mantém o preflight CORS público", async (slug) => {
    const response = await fetch(`${stagingUrl}/functions/v1/${slug}`, {
      method: "OPTIONS",
      headers: {
        apikey: anonKey,
        origin: "https://oraculo-v2-aize.netlify.app",
        "access-control-request-method": "POST",
        "access-control-request-headers": "authorization,apikey,content-type",
      },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
  });

  it.each(FUNCTIONS)("%s recusa chamada sem JWT no gateway", async (slug) => {
    // The local legacy anon key is itself a JWT. Omitting only Authorization
    // would still authenticate at the local gateway through the apikey header.
    const response = await callFunction(slug, undefined, false);
    expect(response.status).toBe(401);
  });

  it.each(FUNCTIONS)("%s aceita JWT válido e alcança a validação interna", async (slug) => {
    const response = await callFunction(slug, accessToken);
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Empresa (e email são obrigatórios|obrigatória)/);
  });
});
