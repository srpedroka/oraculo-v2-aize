import { serviceClient } from "./auth.ts";
import {
  getOrCreateConversation,
  insertConversationMessage,
  maybeSummarize,
  type ConversationRecord,
} from "./conversations.ts";
import { corsHeaders, jsonResponse } from "./cors.ts";
import { isConfirmationMessage } from "./confirmation-policy.ts";
import { classifyOracleIntent } from "./intent-router.ts";
import { periodForClose, periodForPlanning } from "./periods.ts";
import {
  confirmPendingQuickUpdate,
  handleQuickUpdate,
  type PendingQuickUpdateConfirmation,
} from "./quick-updates.ts";
import { isAiControlLimitError } from "./ai-controls.ts";
import { explicitPlanningRequest, resolveAreaFromMessage } from "./whatsapp-planning.ts";
import { recordWhatsAppHealthEvent } from "./whatsapp-health-events.ts";
import { classifyWhatsAppSenderFailure } from "./whatsapp-sender.ts";
import { isExplicitPlanningResume } from "./conversation-policy.ts";
import {
  confirmPlanningProposal,
  processPlanningMessage,
  startPlanningSession,
} from "./session-engine.ts";
import {
  isDurableWhatsAppPathReady,
  sanitizeWhatsAppInboundPayload,
  shouldQueueWhatsAppInbound,
  type WhatsAppInboundKind,
} from "./whatsapp-queue.ts";
import { normalizePhone, phoneCandidates } from "./phone.ts";
import {
  buildWebhookEventKey,
  deriveEvoGoWebhookToken,
  extractAudioInfo,
  extractDocumentInfo,
  extractRemote,
  extractText,
  extractWebhookMessageId,
  isMessageFromCurrentInstance,
  timingSafeEqual,
} from "./whatsapp-event.ts";
import { extractInstanceName, transcribeIncomingAudio } from "./whatsapp-media.ts";
import {
  buildAnswer,
  buildOutOfScopeReply,
  isClearlyGeneralTopic,
  sendFormattedWhatsApp,
  sendPlanDocumentWhatsApp,
} from "./whatsapp-conversation.ts";
import { answerDocumentQuestion, loadActiveAreas, processIncomingDocument } from "./whatsapp-documents.ts";
import { scheduleWhatsAppWorkerWake } from "./whatsapp-worker-wake.ts";

function pendingConversationContext(conversation: ConversationRecord) {
  const context = conversation.pending_context;
  if (!context || typeof context !== "object") return null;
  const expiresAt = String(context.expiresAt ?? "");
  if (expiresAt && new Date(expiresAt).getTime() < Date.now()) return null;
  return context;
}

function isRejectionMessage(value: string) {
  return /^(nao|não|agora nao|agora não|deixa|dispenso|prefiro nao|prefiro não|só compartilhar|so compartilhar)[.!\s]*$/i.test(value.trim());
}

function isExplicitQuickUpdateConfirmation(value: string) {
  return isConfirmationMessage(value);
}

export interface WhatsAppWebhookOptions {
  forceSynchronous?: boolean;
}

export async function handleWhatsAppWebhook(req: Request, options: WhatsAppWebhookOptions = {}) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let dedupeClient: ReturnType<typeof serviceClient> | null = null;
  let dedupeOrgId = "";
  let dedupeEventKey = "";

  try {
    const url = new URL(req.url);
    const payload = await req.json();
    const client = serviceClient();
    const requestedOrgId = url.searchParams.get("orgId") ?? payload?.orgId ?? null;
    const instanceName = extractInstanceName(payload);

    // Resolve os settings primeiro pelo orgId da URL; se nao achar (ex.: org recriada com novo id
    // e URL desatualizada na Evolution), cai de volta para o instance_name, que e estavel. Isso
    // evita 404 silencioso e a parada muda do WhatsApp quando o orgId da URL fica velho.
    let whatsappSettings: any = null;
    if (requestedOrgId) {
      const byOrg = await client.from("whatsapp_settings").select("*").eq("enabled", true).eq("org_id", requestedOrgId).maybeSingle();
      if (byOrg.error) throw byOrg.error;
      whatsappSettings = byOrg.data;
    }
    if (!whatsappSettings && instanceName) {
      const byInstance = await client.from("whatsapp_settings").select("*").eq("enabled", true).eq("instance_name", instanceName).maybeSingle();
      if (byInstance.error) throw byInstance.error;
      whatsappSettings = byInstance.data;
    }
    if (!whatsappSettings) return jsonResponse({ error: "WhatsApp não configurado para esta empresa" }, 404);

    const { data: whatsappKeyRow, error: whatsappKeyError } = await client
      .from("whatsapp_instance_keys")
      .select("*")
      .eq("org_id", whatsappSettings.org_id)
      .maybeSingle();
    if (whatsappKeyError) throw whatsappKeyError;

    const receivedSecret =
      req.headers.get("x-oraculo-webhook-secret") ??
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    const headerAuthorized = Boolean(
      whatsappKeyRow?.webhook_secret && receivedSecret && timingSafeEqual(receivedSecret, whatsappKeyRow.webhook_secret),
    );

    // Evo Go Manager nao expoe campo de header customizado. Para essa variante, aceitamos
    // um bearer derivado na URL em vez do segredo bruto salvo no banco.
    const receivedEvoGoToken = url.searchParams.get("evoGoToken") ?? "";
    const expectedEvoGoToken =
      !headerAuthorized && whatsappKeyRow?.webhook_secret && requestedOrgId
        ? await deriveEvoGoWebhookToken(whatsappKeyRow.webhook_secret, whatsappSettings.org_id)
        : "";
    const evoGoUrlAuthorized = Boolean(expectedEvoGoToken && receivedEvoGoToken && timingSafeEqual(receivedEvoGoToken, expectedEvoGoToken));

    if (!headerAuthorized && !evoGoUrlAuthorized) {
      return jsonResponse({ error: "Webhook não autorizado" }, 401);
    }

    if (!options.forceSynchronous) {
      await recordWhatsAppHealthEvent(client, {
        orgId: whatsappSettings.org_id,
        eventType: "webhook_received",
        source: "webhook",
      });
    }

    if (isMessageFromCurrentInstance(payload, whatsappSettings)) return jsonResponse({ ok: true, ignored: "from_me" });

    const extractedText = extractText(payload);
    const hasAudio = Boolean(extractAudioInfo(payload));
    const hasDocument = Boolean(extractDocumentInfo(payload));
    const phone = normalizePhone(extractRemote(payload));
    if ((!extractedText && !hasAudio && !hasDocument) || !phone) return jsonResponse({ ok: true, ignored: true });

    const orgId = whatsappSettings.org_id as string;
    const eventKey = await buildWebhookEventKey(payload, phone, extractedText, hasAudio, hasDocument);
    const inboundKind: WhatsAppInboundKind = hasDocument ? "document" : hasAudio ? "audio" : "text";

    if (!isDurableWhatsAppPathReady(
      inboundKind,
      whatsappSettings.inbound_queue_enabled === true,
      whatsappSettings.outbound_outbox_enabled === true,
      options.forceSynchronous === true,
    )) {
      await recordWhatsAppHealthEvent(client, {
        orgId,
        eventType: "inbound_failed",
        source: "webhook",
        errorCode: "durable_path_disabled",
      });
      return jsonResponse({ error: "Processamento durável do WhatsApp indisponível" }, 503);
    }

    if (shouldQueueWhatsAppInbound(inboundKind, options.forceSynchronous === true)) {
      const phoneOptions = phoneCandidates(phone);
      const { data: queuedProfile, error: queuedProfileError } = await client
        .from("profiles")
        .select("id")
        .in("phone", phoneOptions)
        .maybeSingle();
      if (queuedProfileError) throw queuedProfileError;

      let queuedUserId: string | null = null;
      if (queuedProfile?.id) {
        const { data: queuedMembership, error: queuedMembershipError } = await client
          .from("memberships")
          .select("id")
          .eq("org_id", orgId)
          .eq("user_id", queuedProfile.id)
          .maybeSingle();
        if (queuedMembershipError) throw queuedMembershipError;
        if (queuedMembership) queuedUserId = queuedProfile.id;
      }

      const kind = inboundKind;
      const mediaInfo = kind === "document" ? extractDocumentInfo(payload) : kind === "audio" ? extractAudioInfo(payload) : null;
      const jobPayload = sanitizeWhatsAppInboundPayload(kind, {
        messageId: extractWebhookMessageId(payload),
        text: extractedText,
        remoteJid: mediaInfo?.key?.remoteJid,
        mimeType: mediaInfo?.mimeType,
        fileName: kind === "document" ? mediaInfo?.fileName : undefined,
        caption: extractedText,
      });
      const { data: queuedRows, error: queueError } = await client.rpc("enqueue_whatsapp_inbound_job", {
        p_org_id: orgId,
        p_event_key: eventKey,
        p_phone: phone,
        p_user_id: queuedUserId,
        p_kind: kind,
        p_payload: jobPayload,
      });
      if (queueError) throw queueError;
      const queued = queuedRows?.[0];
      if (!queued?.job_id || !queued?.correlation_id) throw new Error("Fila do WhatsApp não devolveu o job criado");

      scheduleWhatsAppWorkerWake(client, orgId, queued.correlation_id);

      return jsonResponse({
        ok: true,
        queued: true,
        duplicate: queued.inserted !== true,
        correlationId: queued.correlation_id,
      });
    }

    const { error: dedupeError } = await client.from("whatsapp_processed_events").insert({ org_id: orgId, event_key: eventKey });
    if (dedupeError) {
      if (dedupeError.code === "23505") return jsonResponse({ ok: true, duplicate: true });
      throw dedupeError;
    }
    dedupeClient = client;
    dedupeOrgId = orgId;
    dedupeEventKey = eventKey;

    const phoneOptions = phoneCandidates(phone);
    const { data: profile } = await client.from("profiles").select("id, full_name, phone").in("phone", phoneOptions).maybeSingle();
    if (!profile) {
      await sendFormattedWhatsApp(
        whatsappSettings,
        whatsappKeyRow,
        phone,
        "Este número não está cadastrado no Oráculo. Peça ao dono da empresa para vincular seu celular.",
        { forceDirect: true },
      );
      return jsonResponse({ ok: true, rejected: "unknown_phone" });
    }
    const replyPhone = profile.phone ?? phone;

    const { data: membership } = await client
      .from("memberships")
      .select("id, role")
      .eq("org_id", orgId)
      .eq("user_id", profile.id)
      .maybeSingle();
    if (!membership) {
      await sendFormattedWhatsApp(
        whatsappSettings,
        whatsappKeyRow,
        replyPhone,
        "Seu número existe, mas não tem acesso a esta empresa no Oráculo.",
        { forceDirect: true },
      );
      return jsonResponse({ ok: true, rejected: "no_membership" });
    }

    const { data: area } = await client
      .from("areas")
      .select("id")
      .eq("org_id", orgId)
      .eq("coordinator_id", membership.id)
      .is("archived_at", null)
      .limit(1)
      .maybeSingle();
    const areaId = area?.id ?? null;
    const conversation = await getOrCreateConversation(client, {
      orgId,
      userId: profile.id,
      channel: "whatsapp",
      areaId,
    });

    if (hasDocument) {
      const result = await processIncomingDocument(client, orgId, areaId, whatsappSettings, whatsappKeyRow, payload, profile);

      if (!result.skipHistory) {
        await insertConversationMessage(client, {
          orgId,
          areaId,
          userId: profile.id,
          conversationId: conversation.id,
          author: "user",
          text: result.userText,
          channel: "whatsapp",
        });

        await insertConversationMessage(client, {
          orgId,
          areaId,
          userId: profile.id,
          conversationId: conversation.id,
          author: "oracle",
          text: result.answer,
          channel: "whatsapp",
        });
      }

      await sendFormattedWhatsApp(whatsappSettings, whatsappKeyRow, replyPhone, result.answer);
      return jsonResponse({ ok: true, document: "processed" });
    }

    let text = extractedText;
    let wasTranscribedAudio = false;
    const audioDiagnostics: string[] = [];

    if (!text && hasAudio) {
      try {
        text = await transcribeIncomingAudio(client, orgId, profile.id, whatsappSettings, whatsappKeyRow, payload, audioDiagnostics);
        wasTranscribedAudio = Boolean(text);
      } catch (error) {
        console.error("Erro ao transcrever áudio do WhatsApp", error instanceof Error ? error.message : String(error));
        if (isAiControlLimitError(error)) {
          await sendFormattedWhatsApp(whatsappSettings, whatsappKeyRow, replyPhone, error.message, { forceDirect: true });
          return jsonResponse({ ok: true, audio: "ai_limit" });
        }
        audioDiagnostics.push("transcription-error");
      }
    }

    if (!text) {
      const audioFailureText = "[Áudio recebido sem transcrição]";
      const diagnosticCode = audioDiagnostics.slice(-6).join(" | ") || "sem-diagnostico";
      const answer = "Recebi seu áudio, mas não consegui transcrever desta vez. Pode reenviar ou me mandar em texto por enquanto?";
      console.error("Falha final ao processar áudio do WhatsApp", { diagnosticCode });

      await insertConversationMessage(client, {
        orgId,
        areaId,
        userId: profile.id,
        conversationId: conversation.id,
        author: "user",
        text: audioFailureText,
        channel: "whatsapp",
      });

      await insertConversationMessage(client, {
        orgId,
        areaId,
        userId: profile.id,
        conversationId: conversation.id,
        author: "oracle",
        text: answer,
        channel: "whatsapp",
      });

      await sendFormattedWhatsApp(whatsappSettings, whatsappKeyRow, replyPhone, answer);
      return jsonResponse({ ok: true, audio: "transcription_failed" });
    }

    const storedUserText = wasTranscribedAudio ? `[Áudio transcrito] ${text}` : text;

    const confirmationMessage = isConfirmationMessage(text);
    const pendingContext = pendingConversationContext(conversation);

    if (pendingContext?.type === "quick_update_confirmation") {
      if (isExplicitQuickUpdateConfirmation(text)) {
        await insertConversationMessage(client, {
          orgId,
          areaId,
          userId: profile.id,
          conversationId: conversation.id,
          author: "user",
          text: storedUserText,
          channel: "whatsapp",
        });
        const reply = await confirmPendingQuickUpdate(client, {
          orgId,
          areaId,
          userId: profile.id,
          pending: pendingContext as unknown as PendingQuickUpdateConfirmation,
        });
        await client.from("conversations").update({ pending_context: {} }).eq("id", conversation.id);
        await insertConversationMessage(client, {
          orgId,
          areaId,
          userId: profile.id,
          conversationId: conversation.id,
          author: "oracle",
          text: reply,
          channel: "whatsapp",
        });
        await sendFormattedWhatsApp(whatsappSettings, whatsappKeyRow, replyPhone, reply);
        return jsonResponse({ ok: true, intent: "quick_update_confirmed" });
      }
      if (isRejectionMessage(text)) {
        await client.from("conversations").update({ pending_context: {} }).eq("id", conversation.id);
        const reply = "Tudo certo. Não alterei nenhum dado.";
        await insertConversationMessage(client, {
          orgId,
          areaId,
          userId: profile.id,
          conversationId: conversation.id,
          author: "user",
          text: storedUserText,
          channel: "whatsapp",
        });
        await insertConversationMessage(client, {
          orgId,
          areaId,
          userId: profile.id,
          conversationId: conversation.id,
          author: "oracle",
          text: reply,
          channel: "whatsapp",
        });
        await sendFormattedWhatsApp(whatsappSettings, whatsappKeyRow, replyPhone, reply);
        return jsonResponse({ ok: true, intent: "quick_update_declined" });
      }
      await client.from("conversations").update({ pending_context: {} }).eq("id", conversation.id);
    }

    if (pendingContext?.type === "planning_start") {
      const planningType = ["strategic", "quarterly", "monthly"].includes(String(pendingContext.planningType))
        ? String(pendingContext.planningType) as "strategic" | "quarterly" | "monthly"
        : null;
      if (!planningType || isRejectionMessage(text)) {
        await client.from("conversations").update({ pending_context: {} }).eq("id", conversation.id);
        const reply = planningType ? "Tudo certo. Mantive a sessão anterior sem alterações." : "Esse pedido de planejamento expirou. Diga qual plano você quer iniciar.";
        await insertConversationMessage(client, { orgId, areaId, userId: profile.id, conversationId: conversation.id, author: "user", text: storedUserText, channel: "whatsapp" });
        await insertConversationMessage(client, { orgId, areaId, userId: profile.id, conversationId: conversation.id, author: "oracle", text: reply, channel: "whatsapp" });
        await sendFormattedWhatsApp(whatsappSettings, whatsappKeyRow, replyPhone, reply);
        return jsonResponse({ ok: true, intent: "planning_start_cancelled" });
      }

      const areas = await loadActiveAreas(client, orgId);
      const areaMatch = resolveAreaFromMessage(text, areas);
      if (!areaMatch.area) {
        const choices = areaMatch.ambiguous.length
          ? ` Encontrei mais de uma possibilidade: ${areaMatch.ambiguous.map((item) => item.name).join(" ou ")}.`
          : "";
        const reply = `Não consegui identificar a área com segurança.${choices} Qual é o nome da área?`;
        await insertConversationMessage(client, { orgId, areaId, userId: profile.id, conversationId: conversation.id, author: "user", text: storedUserText, channel: "whatsapp" });
        await insertConversationMessage(client, { orgId, areaId, userId: profile.id, conversationId: conversation.id, author: "oracle", text: reply, channel: "whatsapp" });
        await sendFormattedWhatsApp(whatsappSettings, whatsappKeyRow, replyPhone, reply);
        return jsonResponse({ ok: true, intent: "planning_start_missing_area" });
      }

      const sessionToAbandon = String(pendingContext.sessionIdToAbandon ?? "");
      if (sessionToAbandon) {
        const { error: abandonError } = await client
          .from("planning_sessions")
          .update({ status: "abandoned" })
          .eq("id", sessionToAbandon)
          .eq("user_id", profile.id)
          .is("pending_proposal", null);
        if (abandonError) throw abandonError;
      }
      await insertConversationMessage(client, { orgId, areaId: areaMatch.area.id, userId: profile.id, conversationId: conversation.id, author: "user", text: storedUserText, channel: "whatsapp" });
      await client.from("conversations").update({ area_id: areaMatch.area.id, pending_context: {} }).eq("id", conversation.id);
      const sessionResult = await startPlanningSession(client, {
        orgId,
        areaId: areaMatch.area.id,
        type: planningType,
        period: String(pendingContext.period ?? periodForPlanning(planningType, null, text)),
        userId: profile.id,
        channel: "whatsapp",
      });
      await sendFormattedWhatsApp(whatsappSettings, whatsappKeyRow, replyPhone, sessionResult.reply);
      return jsonResponse({ ok: true, intent: "planning_start", sessionId: sessionResult.session.id });
    }

    if (pendingContext?.type === "weekly_capture") {
      await client.from("conversations").update({ pending_context: {} }).eq("id", conversation.id);
      if (confirmationMessage) {
        await insertConversationMessage(client, {
          orgId,
          areaId,
          userId: profile.id,
          conversationId: conversation.id,
          author: "user",
          text: storedUserText,
          channel: "whatsapp",
        });
        const quickUpdate = await handleQuickUpdate(client, {
          orgId,
          areaId,
          userId: profile.id,
          conversationId: conversation.id,
          message: String(pendingContext.originalText ?? ""),
          channel: "whatsapp",
        });
        if (quickUpdate.pendingConfirmation) {
          await client.from("conversations").update({ pending_context: quickUpdate.pendingConfirmation }).eq("id", conversation.id);
        }
        await insertConversationMessage(client, {
          orgId,
          areaId,
          userId: profile.id,
          conversationId: conversation.id,
          author: "oracle",
          text: quickUpdate.reply,
          channel: "whatsapp",
        });
        await sendFormattedWhatsApp(whatsappSettings, whatsappKeyRow, replyPhone, quickUpdate.reply);
        return jsonResponse({ ok: true, intent: "weekly_capture_confirmed" });
      }
      if (isRejectionMessage(text)) {
        const reply = "Tudo certo. Obrigado por compartilhar; fica só na conversa e seguimos daqui.";
        await insertConversationMessage(client, {
          orgId,
          areaId,
          userId: profile.id,
          conversationId: conversation.id,
          author: "user",
          text: storedUserText,
          channel: "whatsapp",
        });
        await insertConversationMessage(client, {
          orgId,
          areaId,
          userId: profile.id,
          conversationId: conversation.id,
          author: "oracle",
          text: reply,
          channel: "whatsapp",
        });
        await sendFormattedWhatsApp(whatsappSettings, whatsappKeyRow, replyPhone, reply);
        return jsonResponse({ ok: true, intent: "weekly_capture_declined" });
      }
    }

    if (pendingContext?.type === "weekly_pulse") {
      await client.from("weekly_pulse_log").update({ responded_at: new Date().toISOString() })
        .eq("org_id", orgId)
        .eq("membership_id", membership.id)
        .eq("week_start", String(pendingContext.weekStart ?? ""));

      const weeklyIntent = await classifyOracleIntent(client, {
        orgId,
        message: text,
        channel: "whatsapp",
        areaId,
        conversationId: conversation.id,
      });
      await client.from("conversations").update({ pending_context: {} }).eq("id", conversation.id);

      if (weeklyIntent.intent === "quick_update") {
        await insertConversationMessage(client, {
          orgId,
          areaId,
          userId: profile.id,
          conversationId: conversation.id,
          author: "user",
          text: storedUserText,
          channel: "whatsapp",
        });
        await maybeSummarize(client, orgId, conversation);
        const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
        await client.from("conversations").update({
          pending_context: { type: "weekly_capture", originalText: text, expiresAt },
        }).eq("id", conversation.id);
        const answer = await buildAnswer(
          client,
          orgId,
          areaId,
          text,
          profile,
          membership,
          conversation,
          [
            "A pessoa está respondendo ao convite leve sobre a semana e relatou um avanço, sucesso ou dificuldade concreta.",
            "Reconheça o que aconteceu antes de falar em registro. Responda em uma ou duas frases naturais.",
            "Termine perguntando se ela quer que você registre isso no objetivo ou ação correspondente. Não diga que já registrou.",
          ].join("\n"),
        );
        await insertConversationMessage(client, {
          orgId,
          areaId,
          userId: profile.id,
          conversationId: conversation.id,
          author: "oracle",
          text: answer,
          channel: "whatsapp",
        });
        await sendFormattedWhatsApp(whatsappSettings, whatsappKeyRow, replyPhone, answer);
        return jsonResponse({ ok: true, intent: "weekly_pulse_update" });
      }
    }

    if (!confirmationMessage && isClearlyGeneralTopic(text)) {
      await insertConversationMessage(client, {
        orgId,
        areaId,
        userId: profile.id,
        conversationId: conversation.id,
        author: "user",
        text: storedUserText,
        channel: "whatsapp",
      });
      await maybeSummarize(client, orgId, conversation);

      const answer = await buildOutOfScopeReply(client, orgId, profile, conversation, text);

      await insertConversationMessage(client, {
        orgId,
        areaId,
        userId: profile.id,
        conversationId: conversation.id,
        author: "oracle",
        text: answer,
        channel: "whatsapp",
      });

      await sendFormattedWhatsApp(whatsappSettings, whatsappKeyRow, replyPhone, answer);
      return jsonResponse({ ok: true, scope: "redirected" });
    }

    const { data: activeSessions, error: activeSessionError } = await client
      .from("planning_sessions")
      .select("id, conversation_id, pending_proposal, type, period, area_id")
      .eq("org_id", orgId)
      .eq("user_id", profile.id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(5);
    if (activeSessionError) throw activeSessionError;

    const resumeRequested = isExplicitPlanningResume(text);
    const activeSession = confirmationMessage
      ? (activeSessions ?? []).find((session: any) => session.pending_proposal) ?? null
      : resumeRequested
        ? activeSessions?.[0] ?? null
        : (activeSessions ?? []).find((session: any) => session.conversation_id === conversation.id) ?? null;

    const explicitStart = explicitPlanningRequest(text);
    if (activeSession && explicitStart) {
      const requestedPeriod = periodForPlanning(explicitStart, null, text);
      if (activeSession.pending_proposal) {
        const reply = "Esta sessão já tem uma proposta pronta aguardando confirmação. Confirme para salvar ou diga que quer descartar a proposta antes de abrir outro plano.";
        await insertConversationMessage(client, { orgId, areaId, userId: profile.id, conversationId: conversation.id, author: "user", text: storedUserText, channel: "whatsapp" });
        await insertConversationMessage(client, { orgId, areaId, userId: profile.id, conversationId: conversation.id, author: "oracle", text: reply, channel: "whatsapp" });
        await sendFormattedWhatsApp(whatsappSettings, whatsappKeyRow, replyPhone, reply);
        return jsonResponse({ ok: true, intent: "planning_switch_pending_proposal" });
      }

      const areas = await loadActiveAreas(client, orgId);
      const areaMatch = explicitStart === "strategic" ? null : resolveAreaFromMessage(text, areas);
      const requestedAreaId = explicitStart === "strategic" ? null : areaMatch?.area?.id ?? areaId;
      if (explicitStart !== "strategic" && !requestedAreaId) {
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
        await client.from("conversations").update({
          pending_context: {
            type: "planning_start",
            planningType: explicitStart,
            period: requestedPeriod,
            sessionIdToAbandon: activeSession.id,
            expiresAt,
          },
        }).eq("id", conversation.id);
        const reply = "Claro. Qual é a área desse novo plano? Só vou trocar de sessão depois de identificar o departamento correto.";
        await insertConversationMessage(client, { orgId, areaId, userId: profile.id, conversationId: conversation.id, author: "user", text: storedUserText, channel: "whatsapp" });
        await insertConversationMessage(client, { orgId, areaId, userId: profile.id, conversationId: conversation.id, author: "oracle", text: reply, channel: "whatsapp" });
        await sendFormattedWhatsApp(whatsappSettings, whatsappKeyRow, replyPhone, reply);
        return jsonResponse({ ok: true, intent: "planning_switch_missing_area" });
      }

      await insertConversationMessage(client, { orgId, areaId: requestedAreaId, userId: profile.id, conversationId: conversation.id, author: "user", text: storedUserText, channel: "whatsapp" });
      const sameSession = activeSession.type === explicitStart && activeSession.period === requestedPeriod && activeSession.area_id === requestedAreaId;
      if (!sameSession) {
        const { error: abandonError } = await client.from("planning_sessions").update({ status: "abandoned" }).eq("id", activeSession.id).eq("user_id", profile.id);
        if (abandonError) throw abandonError;
      }
      await client.from("conversations").update({ area_id: requestedAreaId, pending_context: {} }).eq("id", conversation.id);
      const sessionResult = await startPlanningSession(client, {
        orgId,
        areaId: requestedAreaId,
        type: explicitStart,
        period: requestedPeriod,
        userId: profile.id,
        channel: "whatsapp",
      });
      await sendFormattedWhatsApp(whatsappSettings, whatsappKeyRow, replyPhone, sessionResult.reply);
      return jsonResponse({ ok: true, intent: sameSession ? "planning_resumed" : "planning_switched", sessionId: sessionResult.session.id });
    }

    if (activeSession) {
      if (activeSession.conversation_id !== conversation.id) {
        const { error: rebindError } = await client
          .from("planning_sessions")
          .update({ conversation_id: conversation.id })
          .eq("id", activeSession.id);
        if (rebindError) throw rebindError;
      }
      const sessionResult = activeSession.pending_proposal && confirmationMessage
        ? await confirmPlanningProposal(client, { sessionId: activeSession.id, userId: profile.id, channel: "whatsapp", confirmationText: storedUserText })
        : await processPlanningMessage(client, { sessionId: activeSession.id, message: storedUserText, userId: profile.id, channel: "whatsapp" });
      await sendFormattedWhatsApp(whatsappSettings, whatsappKeyRow, replyPhone, sessionResult.reply);
      if (sessionResult.document) {
        const sent = await sendPlanDocumentWhatsApp(whatsappSettings, whatsappKeyRow, replyPhone, sessionResult.document);
        if (!sent) {
          await sendFormattedWhatsApp(whatsappSettings, whatsappKeyRow, replyPhone, "O plano foi salvo, mas o envio do PDF falhou. O documento continua disponível no app em Documentos.", { forceDirect: true });
        }
      }
      return jsonResponse({ ok: true, session: "processed" });
    }

    await insertConversationMessage(client, {
      orgId,
      areaId,
      userId: profile.id,
      conversationId: conversation.id,
      author: "user",
      text: storedUserText,
      channel: "whatsapp",
    });
    await maybeSummarize(client, orgId, conversation);

    const deterministicPlanningType = explicitPlanningRequest(text);
    const intent = deterministicPlanningType
      ? { intent: "start_planning" as const, planning_type: deterministicPlanningType, period_hint: null, confidence: 1 }
      : await classifyOracleIntent(client, {
        orgId,
        message: text,
        channel: "whatsapp",
        areaId,
        conversationId: conversation.id,
      });

    if (intent.intent === "start_planning") {
      if (!intent.planning_type) {
        const reply = "Claro. Qual plano você quer montar agora: *estratégico anual*, *trimestral* ou *mensal*?";
        await insertConversationMessage(client, {
          orgId,
          areaId,
          userId: profile.id,
          conversationId: conversation.id,
          author: "oracle",
          text: reply,
          channel: "whatsapp",
        });
        await sendFormattedWhatsApp(whatsappSettings, whatsappKeyRow, replyPhone, reply);
        return jsonResponse({ ok: true, intent: "start_planning_missing_type" });
      }

      const areas = await loadActiveAreas(client, orgId);
      const areaMatch = intent.planning_type === "strategic" ? null : resolveAreaFromMessage(text, areas);
      const requestedAreaId = intent.planning_type === "strategic" ? null : areaMatch?.area?.id ?? areaId;
      const requestedPeriod = periodForPlanning(intent.planning_type, intent.period_hint, text);
      if (intent.planning_type !== "strategic" && !requestedAreaId) {
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
        await client.from("conversations").update({
          pending_context: {
            type: "planning_start",
            planningType: intent.planning_type,
            period: requestedPeriod,
            expiresAt,
          },
        }).eq("id", conversation.id);
        const reply = "Qual é a área desse plano? Preciso identificar o departamento antes de iniciar a condução.";
        await insertConversationMessage(client, { orgId, areaId, userId: profile.id, conversationId: conversation.id, author: "oracle", text: reply, channel: "whatsapp" });
        await sendFormattedWhatsApp(whatsappSettings, whatsappKeyRow, replyPhone, reply);
        return jsonResponse({ ok: true, intent: "start_planning_missing_area" });
      }

      await client.from("conversations").update({ area_id: requestedAreaId, pending_context: {} }).eq("id", conversation.id);
      const sessionResult = await startPlanningSession(client, {
        orgId,
        areaId: requestedAreaId,
        type: intent.planning_type,
        period: requestedPeriod,
        userId: profile.id,
        channel: "whatsapp",
      });
      const reply = sessionResult.reply;
      await sendFormattedWhatsApp(whatsappSettings, whatsappKeyRow, replyPhone, reply);
      return jsonResponse({ ok: true, intent: "start_planning", sessionId: sessionResult.session.id });
    }

    if (intent.intent === "quick_update") {
      const quickUpdate = await handleQuickUpdate(client, {
        orgId,
        areaId,
        userId: profile.id,
        conversationId: conversation.id,
        message: text,
        channel: "whatsapp",
      });
      if (quickUpdate.handled) {
        if (quickUpdate.pendingConfirmation) {
          await client.from("conversations").update({ pending_context: quickUpdate.pendingConfirmation }).eq("id", conversation.id);
        }
        await insertConversationMessage(client, {
          orgId,
          areaId,
          userId: profile.id,
          conversationId: conversation.id,
          author: "oracle",
          text: quickUpdate.reply,
          channel: "whatsapp",
        });
        await sendFormattedWhatsApp(whatsappSettings, whatsappKeyRow, replyPhone, quickUpdate.reply);
        return jsonResponse({ ok: true, intent: "quick_update" });
      }
    }

    if (intent.intent === "close_period") {
      const closeType = intent.planning_type === "quarterly" ? "quarter_close" : "month_close";
      if (!areaId) {
        const reply = closeType === "quarter_close"
          ? "Claro. De qual departamento você quer fechar o trimestre?"
          : "Claro. De qual departamento você quer fechar o mês?";
        await insertConversationMessage(client, {
          orgId,
          areaId,
          userId: profile.id,
          conversationId: conversation.id,
          author: "oracle",
          text: reply,
          channel: "whatsapp",
        });
        await sendFormattedWhatsApp(whatsappSettings, whatsappKeyRow, replyPhone, reply);
        return jsonResponse({ ok: true, intent: "close_period_missing_area" });
      }
      const sessionResult = await startPlanningSession(client, {
        orgId,
        areaId,
        type: closeType,
        period: periodForClose(closeType === "quarter_close" ? "quarterly" : "monthly", intent.period_hint, text),
        userId: profile.id,
        channel: "whatsapp",
      });
      const reply = sessionResult.reply;
      await sendFormattedWhatsApp(whatsappSettings, whatsappKeyRow, replyPhone, reply);
      return jsonResponse({ ok: true, intent: "close_period", sessionId: sessionResult.session.id });
    }

    if (intent.intent === "document_question") {
      const result = await answerDocumentQuestion(client, {
        orgId,
        areaId,
        message: text,
        conversationId: conversation.id,
      });
      await insertConversationMessage(client, {
        orgId,
        areaId,
        userId: profile.id,
        conversationId: conversation.id,
        author: "oracle",
        text: result.reply,
        channel: "whatsapp",
      });
      await sendFormattedWhatsApp(whatsappSettings, whatsappKeyRow, replyPhone, result.reply);
      if (result.document && result.sendAsAttachment) {
        const sent = await sendPlanDocumentWhatsApp(whatsappSettings, whatsappKeyRow, replyPhone, result.document);
        if (!sent) {
          await sendFormattedWhatsApp(whatsappSettings, whatsappKeyRow, replyPhone, "Não consegui anexar o PDF agora. O documento correto continua disponível no app em Documentos.", { forceDirect: true });
        }
      }
      return jsonResponse({ ok: true, intent: "document_question" });
    }

    const answer = await buildAnswer(client, orgId, areaId, text, profile, membership, conversation);

    await insertConversationMessage(client, {
      orgId,
      areaId,
      userId: profile.id,
      conversationId: conversation.id,
      author: "oracle",
      text: answer,
      channel: "whatsapp",
    });

    await sendFormattedWhatsApp(whatsappSettings, whatsappKeyRow, replyPhone, answer);
    return jsonResponse({ ok: true });
  } catch (error) {
    if (dedupeClient && dedupeOrgId && dedupeEventKey) {
      await dedupeClient.from("whatsapp_processed_events").delete().eq("org_id", dedupeOrgId).eq("event_key", dedupeEventKey);
    }
    return jsonResponse({ error: error instanceof Error ? error.message : "Erro no webhook do WhatsApp" }, 400);
  }
}
