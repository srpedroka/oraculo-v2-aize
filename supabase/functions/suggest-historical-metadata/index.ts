import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { assertOrgMember, getUser, serviceClient } from "../_shared/auth.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { suggestHistoricalMetadata, suggestHistoricalMetadataFromImage } from "../_shared/historical-classifier.ts";
import type { ModelImageInput } from "../_shared/model.ts";

const MAX_TEXT_LENGTH = 200_000;
const MAX_FILENAME_LENGTH = 180;
const MAX_IMAGE_BASE64_CHARS = 12_000_000;
const ALLOWED_IMAGE_MIME = new Set(["image/jpeg", "image/png"]);

function asText(value: unknown, maxLength = 10_000) {
  return String(value ?? "").replace(/\r\n?/g, "\n").replace(/\u00a0/g, " ").trim().slice(0, maxLength);
}

function parseImage(raw: unknown): ModelImageInput | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const mimeType = asText((raw as { mimeType?: unknown }).mimeType, 40);
  const base64 = asText((raw as { base64?: unknown }).base64, MAX_IMAGE_BASE64_CHARS).replace(/\s+/g, "");
  if (!mimeType || !base64) return null;
  if (!ALLOWED_IMAGE_MIME.has(mimeType)) {
    throw new Error("Imagem inválida. Use JPG ou PNG (WEBP é convertido no navegador para JPEG).");
  }
  if (base64.length < 32) throw new Error("Imagem inválida ou vazia.");
  return { mimeType: mimeType as ModelImageInput["mimeType"], base64 };
}

async function loadCandidateAreas(client: ReturnType<typeof serviceClient>, params: { orgId: string; membership: { id: string; role: string } }) {
  let query = client
    .from("areas")
    .select("id, name, coordinator_id")
    .eq("org_id", params.orgId)
    .is("archived_at", null)
    .order("name");
  if (params.membership.role !== "owner") query = query.eq("coordinator_id", params.membership.id);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((area: { id: string; name: string }) => ({ id: area.id, name: area.name }));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Método não permitido" }, 405);

  try {
    const user = await getUser(req);
    const payload = await req.json();
    const orgId = asText(payload.orgId, 80);
    const rawText = asText(payload.rawText, MAX_TEXT_LENGTH);
    const fileName = asText(payload.fileName, MAX_FILENAME_LENGTH) || null;
    const image = parseImage(payload.image);

    if (!orgId) throw new Error("Empresa ausente");
    if (!rawText && !image) throw new Error("Cole, importe o texto ou envie uma imagem do histórico");

    const client = serviceClient();
    const membership = await assertOrgMember(user.id, orgId);
    if (membership.role === "admin") throw new Error("Admin não pode importar histórico");

    const areas = await loadCandidateAreas(client, { orgId, membership });
    const { data: organization, error: organizationError } = await client.from("organizations").select("name").eq("id", orgId).maybeSingle();
    if (organizationError) throw organizationError;
    if (membership.role !== "owner" && !areas.length) {
      throw new Error("Seu usuário precisa coordenar uma área para importar histórico");
    }

    if (image) {
      const result = await suggestHistoricalMetadataFromImage(client, {
        orgId,
        image,
        fileName,
        areas,
        activeCompanyName: organization?.name ?? null,
      });
      return jsonResponse({
        suggestion: result.suggestion,
        extractedText: result.extractedText,
        tableExpanded: result.tableExpanded,
        importSuggestion: result.importSuggestion,
        candidates: result.importSuggestion.candidates,
        tables: result.importSuggestion.tables,
        conflicts: result.importSuggestion.conflicts,
        warnings: result.importSuggestion.warnings,
        headerMetadata: result.headerMetadata,
      });
    }

    const result = await suggestHistoricalMetadata(client, { orgId, rawText, fileName, areas, activeCompanyName: organization?.name ?? null });
    return jsonResponse({
      suggestion: result.suggestion,
      extractedText: result.extractedText,
      tableExpanded: result.tableExpanded,
      importSuggestion: result.importSuggestion,
      candidates: result.importSuggestion.candidates,
      tables: result.importSuggestion.tables,
      conflicts: result.importSuggestion.conflicts,
      warnings: result.importSuggestion.warnings,
      headerMetadata: result.headerMetadata,
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Não foi possível interpretar o histórico" }, 400);
  }
});
