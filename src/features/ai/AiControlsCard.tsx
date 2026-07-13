import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, DollarSign, Gauge, Save, ShieldCheck } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { supabase } from "../../lib/supabase";

type EnforcementMode = "monitor" | "block";

interface PolicyDraft {
  personCallsPerMinute: number;
  orgCallsPerMinute: number;
  monthlyBudgetUsd: number;
  enforcementMode: EnforcementMode;
}

interface LimitEvent {
  id: string;
  kind: "person_rate" | "org_rate" | "monthly_budget";
  threshold_percent: number;
  observed_value: number;
  limit_value: number;
  blocked: boolean;
  created_at: string;
}

const DEFAULT_POLICY: PolicyDraft = {
  personCallsPerMinute: 10,
  orgCallsPerMinute: 60,
  monthlyBudgetUsd: 100,
  enforcementMode: "monitor",
};

function eventLabel(event: LimitEvent) {
  if (event.kind === "person_rate") return "Rajada por pessoa";
  if (event.kind === "org_rate") return "Rajada da empresa";
  return `Orçamento em ${event.threshold_percent}%`;
}

async function edgeError(error: unknown) {
  const response = (error as { context?: unknown })?.context;
  if (response instanceof Response) {
    const body = await response.clone().json().catch(() => null) as { error?: unknown } | null;
    if (typeof body?.error === "string") return body.error;
  }
  return error instanceof Error ? error.message : "Não foi possível salvar os limites.";
}

export function AiControlsCard({ orgId }: { orgId: string }) {
  const [draft, setDraft] = useState<PolicyDraft>(DEFAULT_POLICY);
  const [monthCost, setMonthCost] = useState(0);
  const [monthCalls, setMonthCalls] = useState(0);
  const [events, setEvents] = useState<LimitEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString();
    const [policyResult, usageResult, eventsResult] = await Promise.all([
      supabase.from("ai_control_policies").select("*").eq("org_id", orgId).maybeSingle(),
      supabase.from("ai_monthly_usage").select("calls, total_cost_usd").eq("org_id", orgId).eq("month_start", monthStart).maybeSingle(),
      supabase.from("ai_limit_events").select("id, kind, threshold_percent, observed_value, limit_value, blocked, created_at").eq("org_id", orgId).order("created_at", { ascending: false }).limit(10),
    ]);
    if (policyResult.error || usageResult.error || eventsResult.error) {
      setError(policyResult.error?.message ?? usageResult.error?.message ?? eventsResult.error?.message ?? "Erro ao carregar limites.");
    } else {
      const policy = policyResult.data;
      setDraft(policy ? {
        personCallsPerMinute: Number(policy.person_calls_per_minute),
        orgCallsPerMinute: Number(policy.org_calls_per_minute),
        monthlyBudgetUsd: Number(policy.monthly_budget_usd),
        enforcementMode: policy.enforcement_mode === "block" ? "block" : "monitor",
      } : DEFAULT_POLICY);
      setMonthCost(Number(usageResult.data?.total_cost_usd ?? 0));
      setMonthCalls(Number(usageResult.data?.calls ?? 0));
      setEvents((eventsResult.data ?? []).map((event) => ({
        ...event,
        observed_value: Number(event.observed_value),
        limit_value: Number(event.limit_value),
      })) as LimitEvent[]);
    }
    setLoading(false);
  }, [orgId]);

  useEffect(() => {
    setMessage("");
    setError("");
    void load();
  }, [load]);

  const budgetPercent = useMemo(
    () => draft.monthlyBudgetUsd > 0 ? Math.min(999, (monthCost / draft.monthlyBudgetUsd) * 100) : 0,
    [draft.monthlyBudgetUsd, monthCost],
  );

  async function save() {
    if (!supabase) return;
    setSaving(true);
    setMessage("");
    setError("");
    const { data, error: invokeError } = await supabase.functions.invoke("save-ai-control-policy", {
      body: { orgId, ...draft },
    });
    if (invokeError) setError(await edgeError(invokeError));
    else if (data?.error) setError(String(data.error));
    else {
      setMessage(draft.enforcementMode === "monitor"
        ? "Limites salvos em observação. Nada será bloqueado."
        : "Limites salvos com bloqueio ativo.");
      await load();
    }
    setSaving(false);
  }

  if (loading) return <p className="text-sm text-text-secondary">Carregando limites...</p>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Gauge className="h-4 w-4 text-text-secondary" />
            <h3 className="text-sm font-semibold text-text">Limites e orçamento</h3>
          </div>
          <p className="mt-1 text-sm leading-6 text-text-secondary">Monitora rajadas e custo mensal sem interferir no uso normal.</p>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${draft.enforcementMode === "monitor" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
          {draft.enforcementMode === "monitor" ? "Tudo liberado" : "Bloqueio ativo"}
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-control border border-border bg-surface-muted p-4">
          <div className="flex items-center gap-2"><DollarSign className="h-4 w-4 text-text-secondary" /><p className="text-sm font-semibold text-text">Este mês</p></div>
          <p className="mt-2 text-xl font-semibold text-text">US$ {monthCost.toFixed(2)}</p>
          <p className="mt-1 text-xs text-text-secondary">{monthCalls} chamadas · {budgetPercent.toFixed(1)}% da referência</p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-fill-press"><div className="h-full bg-accent transition-[width]" style={{ width: `${Math.min(100, budgetPercent)}%` }} /></div>
        </div>
        <div className="rounded-control border border-border bg-surface-muted p-4">
          <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-text-secondary" /><p className="text-sm font-semibold text-text">Comportamento</p></div>
          <p className="mt-2 text-sm font-medium text-text">{draft.enforcementMode === "monitor" ? "Só observar e registrar" : "Bloquear ao exceder"}</p>
          <p className="mt-1 text-xs leading-5 text-text-secondary">Em observação, até rajadas e orçamento acima de 100% continuam liberados.</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <label className="block"><span className="mb-1.5 block text-sm font-medium text-text">Pessoa / minuto</span><input type="number" min="1" max="300" value={draft.personCallsPerMinute} onChange={(event) => setDraft((current) => ({ ...current, personCallsPerMinute: Number(event.target.value) }))} className="h-10 w-full rounded-control border border-border px-3 text-sm" /></label>
        <label className="block"><span className="mb-1.5 block text-sm font-medium text-text">Empresa / minuto</span><input type="number" min="1" max="3000" value={draft.orgCallsPerMinute} onChange={(event) => setDraft((current) => ({ ...current, orgCallsPerMinute: Number(event.target.value) }))} className="h-10 w-full rounded-control border border-border px-3 text-sm" /></label>
        <label className="block"><span className="mb-1.5 block text-sm font-medium text-text">Referência mensal (US$)</span><input type="number" min="1" max="1000000" step="1" value={draft.monthlyBudgetUsd} onChange={(event) => setDraft((current) => ({ ...current, monthlyBudgetUsd: Number(event.target.value) }))} className="h-10 w-full rounded-control border border-border px-3 text-sm" /></label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-4">
        <div className="flex items-start gap-3">
          <Activity className="mt-0.5 h-4 w-4 text-text-secondary" />
          <div><p className="text-sm font-semibold text-text">Bloquear quando exceder</p><p className="mt-1 text-xs leading-5 text-text-secondary">Deixe desligado para manter tudo liberado.</p></div>
        </div>
        <button type="button" role="switch" aria-checked={draft.enforcementMode === "block"} aria-label="Bloquear IA quando exceder os limites" onClick={() => setDraft((current) => ({ ...current, enforcementMode: current.enforcementMode === "block" ? "monitor" : "block" }))} className={`relative h-7 w-12 rounded-full border transition-colors ${draft.enforcementMode === "block" ? "border-amber-600 bg-amber-600" : "border-border bg-fill-press"}`}><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${draft.enforcementMode === "block" ? "translate-x-5" : "translate-x-0.5"}`} /></button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-text-tertiary">Alertas de orçamento são registrados uma vez em 70%, 90% e 100% por mês.</p>
        <Button icon={Save} loading={saving} onClick={() => void save()}>Salvar limites</Button>
      </div>

      {events.length ? <div className="border-t border-border pt-4"><p className="mb-2 text-xs font-medium uppercase text-text-tertiary">Alertas recentes</p><div className="space-y-2">{events.map((event) => <div key={event.id} className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-border px-3 py-2"><div className="flex items-center gap-2"><AlertTriangle className={`h-4 w-4 ${event.blocked ? "text-red-600" : "text-amber-600"}`} /><span className="text-sm font-medium text-text">{eventLabel(event)}</span></div><span className="text-xs text-text-secondary">{event.blocked ? "Bloqueado" : "Observado"} · {new Date(event.created_at).toLocaleString("pt-BR")}</span></div>)}</div></div> : null}
      {error ? <p role="alert" className="rounded-control border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {message ? <p role="status" aria-live="polite" className="rounded-control border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p> : null}
    </div>
  );
}
