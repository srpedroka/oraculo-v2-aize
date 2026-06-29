import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { assertOwner, getUser, serviceClient } from "../_shared/auth.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const user = await getUser(req);
    const { orgId, email, fullName, role = "coordinator", areaId = null } = await req.json();
    if (!orgId || !email) return jsonResponse({ error: "Empresa e email são obrigatórios" }, 400);

    await assertOwner(user.id, orgId);
    const client = serviceClient();

    const invite = await client.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName || email },
    });

    if (invite.error) throw invite.error;
    const invitedUser = invite.data.user;
    if (!invitedUser) throw new Error("Usuário não retornado pelo convite");

    await client.from("profiles").upsert({
      id: invitedUser.id,
      full_name: fullName || email,
    });

    const { data: membership, error: membershipError } = await client
      .from("memberships")
      .upsert({ org_id: orgId, user_id: invitedUser.id, role }, { onConflict: "org_id,user_id" })
      .select("id")
      .single();

    if (membershipError) throw membershipError;

    if (areaId) {
      const { error: areaError } = await client
        .from("areas")
        .update({ coordinator_id: membership.id })
        .eq("id", areaId)
        .eq("org_id", orgId);
      if (areaError) throw areaError;
    }

    return jsonResponse({ ok: true });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Erro ao convidar pessoa" }, 400);
  }
});
