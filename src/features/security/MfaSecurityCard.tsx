import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, KeyRound, ShieldCheck, ShieldOff, Smartphone, Trash2 } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { normalizeTotpCode, totpQrDataUrl } from "../../lib/mfa";
import { supabase } from "../../lib/supabase";

type TotpFactor = {
  id: string;
  friendly_name?: string;
  status: "verified" | "unverified";
  created_at: string;
};

type Enrollment = {
  factorId: string;
  qrCode: string;
  secret: string;
};

async function functionError(error: unknown) {
  const response = (error as { context?: unknown })?.context;
  if (response instanceof Response) {
    const body = await response.clone().json().catch(() => null) as { error?: unknown } | null;
    if (typeof body?.error === "string") return body.error;
  }
  return error instanceof Error ? error.message : "Não foi possível concluir a operação.";
}

function factorName(factor: TotpFactor, index: number) {
  return factor.friendly_name?.trim() || `Autenticador ${index + 1}`;
}

export function MfaSecurityCard({ orgId }: { orgId: string }) {
  const [factors, setFactors] = useState<TotpFactor[]>([]);
  const [currentLevel, setCurrentLevel] = useState<string | null>(null);
  const [policyEnabled, setPolicyEnabled] = useState(false);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const verifiedFactors = useMemo(() => factors.filter((factor) => factor.status === "verified"), [factors]);
  const isAal2 = currentLevel === "aal2";

  const refresh = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const [factorResult, aalResult, policyResult] = await Promise.all([
      supabase.auth.mfa.listFactors(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      supabase
        .from("organization_security_settings")
        .select("require_mfa_for_critical_actions")
        .eq("org_id", orgId)
        .maybeSingle(),
    ]);
    if (factorResult.error) setError(factorResult.error.message);
    else setFactors(factorResult.data.all.filter((factor) => factor.factor_type === "totp") as TotpFactor[]);
    if (aalResult.error) setError(aalResult.error.message);
    else setCurrentLevel(aalResult.data.currentLevel);
    if (policyResult.error) setError(policyResult.error.message);
    else setPolicyEnabled(Boolean(policyResult.data?.require_mfa_for_critical_actions));
    setLoading(false);
  }, [orgId]);

  useEffect(() => {
    setEnrollment(null);
    setCode("");
    setMessage("");
    setError("");
    void refresh();
  }, [refresh]);

  async function beginEnrollment() {
    if (!supabase) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      for (const factor of factors.filter((item) => item.status === "unverified")) {
        await supabase.auth.mfa.unenroll({ factorId: factor.id });
      }
      const result = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `Oráculo ${verifiedFactors.length + 1}`,
        issuer: "Oráculo",
      });
      if (result.error) throw result.error;
      setEnrollment({
        factorId: result.data.id,
        qrCode: totpQrDataUrl(result.data.totp.qr_code),
        secret: result.data.totp.secret,
      });
      setCode("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível iniciar o cadastro.");
    } finally {
      setBusy(false);
    }
  }

  async function cancelEnrollment() {
    if (!supabase || !enrollment) return;
    setBusy(true);
    const result = await supabase.auth.mfa.unenroll({ factorId: enrollment.factorId });
    if (result.error) setError(result.error.message);
    setEnrollment(null);
    setCode("");
    await refresh();
    setBusy(false);
  }

  async function verifyFactor(factorId: string, successMessage: string) {
    if (!supabase || code.length !== 6) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const challenge = await supabase.auth.mfa.challenge({ factorId });
      if (challenge.error) throw challenge.error;
      const verification = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.data.id,
        code,
      });
      if (verification.error) throw verification.error;
      setEnrollment(null);
      setCode("");
      setMessage(successMessage);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Código inválido.");
    } finally {
      setBusy(false);
    }
  }

  async function removeFactor(factor: TotpFactor) {
    if (!supabase) return;
    if (policyEnabled && verifiedFactors.length === 1) {
      setError("Desative a proteção de ações críticas antes de remover o último autenticador.");
      return;
    }
    if (!isAal2) {
      setError("Confirme um código abaixo antes de remover um autenticador.");
      return;
    }
    setBusy(true);
    setError("");
    const result = await supabase.auth.mfa.unenroll({ factorId: factor.id });
    if (result.error) setError(result.error.message);
    else setMessage("Autenticador removido.");
    await refresh();
    setBusy(false);
  }

  async function changePolicy(enabled: boolean) {
    if (!supabase) return;
    if (!isAal2) {
      setError("Confirme o código do autenticador antes de alterar esta proteção.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    const { data, error: invokeError } = await supabase.functions.invoke("save-security-settings", {
      body: { orgId, requireMfaForCriticalActions: enabled },
    });
    if (invokeError) setError(await functionError(invokeError));
    else if (data?.error) setError(String(data.error));
    else {
      setPolicyEnabled(enabled);
      setMessage(enabled ? "Proteção reforçada ativada." : "Proteção reforçada desativada.");
    }
    setBusy(false);
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-text-secondary" />
          <div>
            <h2 className="text-base font-semibold text-text">Segurança da conta</h2>
            <p className="mt-1 text-sm leading-6 text-text-secondary">
              O segundo fator é opcional e não muda o login ou o uso cotidiano do Oráculo.
            </p>
          </div>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${policyEnabled ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-border bg-surface-muted text-text-secondary"}`}>
          {policyEnabled ? "Proteção ativa" : "Proteção opcional"}
        </span>
      </div>

      {loading ? <p className="mt-5 text-sm text-text-secondary">Carregando segurança...</p> : (
        <div className="mt-5 space-y-5">
          <div className="border-t border-border pt-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-text">Aplicativos autenticadores</p>
                <p className="mt-1 text-sm text-text-secondary">Cadastre mais de um dispositivo para facilitar a recuperação.</p>
              </div>
              {!enrollment ? <Button variant="ghost" icon={Smartphone} loading={busy} onClick={() => void beginEnrollment()}>Adicionar</Button> : null}
            </div>

            {verifiedFactors.length ? (
              <div className="mt-4 divide-y divide-border rounded-control border border-border">
                {verifiedFactors.map((factor, index) => (
                  <div key={factor.id} className="flex items-center justify-between gap-3 px-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-text">{factorName(factor, index)}</p>
                      <p className="mt-0.5 text-xs text-text-tertiary">Confirmado</p>
                    </div>
                    <Button size="icon" variant="quiet" icon={Trash2} aria-label={`Remover ${factorName(factor, index)}`} title="Remover autenticador" disabled={busy} onClick={() => void removeFactor(factor)} />
                  </div>
                ))}
              </div>
            ) : <p className="mt-4 rounded-control border border-border bg-surface-muted px-3 py-3 text-sm text-text-secondary">Nenhum autenticador cadastrado.</p>}
          </div>

          {enrollment ? (
            <div className="border-t border-border pt-5">
              <p className="text-sm font-semibold text-text">Escaneie e confirme</p>
              <div className="mt-4 grid gap-5 sm:grid-cols-[180px_1fr] sm:items-start">
                <img src={enrollment.qrCode} alt="QR Code para cadastrar o autenticador" className="aspect-square w-[180px] rounded-control border border-border bg-white p-2" />
                <div className="min-w-0 space-y-3">
                  <p className="text-sm leading-6 text-text-secondary">Escaneie o QR Code ou informe esta chave manualmente:</p>
                  <code className="block break-all rounded-control border border-border bg-surface-muted px-3 py-2 text-xs text-text">{enrollment.secret}</code>
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-text">Código de seis dígitos</span>
                    <input value={code} inputMode="numeric" autoComplete="one-time-code" onChange={(event) => setCode(normalizeTotpCode(event.target.value))} className="h-10 w-full max-w-[220px] rounded-control border border-border px-3 text-sm" />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <Button icon={CheckCircle2} loading={busy} disabled={code.length !== 6} onClick={() => void verifyFactor(enrollment.factorId, "Autenticador confirmado.")}>Confirmar</Button>
                    <Button variant="quiet" disabled={busy} onClick={() => void cancelEnrollment()}>Cancelar</Button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {verifiedFactors.length > 0 && !isAal2 && !enrollment ? (
            <div className="border-t border-border pt-5">
              <div className="flex items-start gap-3">
                <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-text-secondary" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-text">Confirmar identidade nesta sessão</p>
                  <p className="mt-1 text-sm leading-6 text-text-secondary">Só será necessário para alterar a proteção ou, futuramente, executar uma ação protegida.</p>
                  <div className="mt-3 flex flex-wrap items-end gap-2">
                    <label>
                      <span className="mb-1.5 block text-xs font-medium text-text-secondary">Código</span>
                      <input value={code} inputMode="numeric" autoComplete="one-time-code" onChange={(event) => setCode(normalizeTotpCode(event.target.value))} className="h-10 w-[160px] rounded-control border border-border px-3 text-sm" />
                    </label>
                    <Button icon={KeyRound} loading={busy} disabled={code.length !== 6} onClick={() => void verifyFactor(verifiedFactors[0].id, "Identidade confirmada nesta sessão.")}>Confirmar</Button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <div className="border-t border-border pt-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-2xl">
                <div className="flex items-center gap-2">
                  {policyEnabled ? <ShieldCheck className="h-4 w-4 text-emerald-600" /> : <ShieldOff className="h-4 w-4 text-text-tertiary" />}
                  <p className="text-sm font-semibold text-text">Exigir segundo fator em ações críticas</p>
                </div>
                <p className="mt-1 text-sm leading-6 text-text-secondary">
                  Protege chaves de IA, WhatsApp, papéis, pacotes de backup, restauração, arquivamento e exclusão. Planejamento, Dashboard e conversas continuam sem código.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={policyEnabled}
                aria-label="Exigir segundo fator em ações críticas"
                disabled={busy || verifiedFactors.length === 0}
                onClick={() => void changePolicy(!policyEnabled)}
                className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${policyEnabled ? "border-emerald-600 bg-emerald-600" : "border-border bg-fill-press"}`}
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${policyEnabled ? "translate-x-5" : "translate-x-0.5"}`} />
              </button>
            </div>
            {verifiedFactors.length === 0 ? <p className="mt-2 text-xs text-text-tertiary">Cadastre e confirme um autenticador antes de ativar.</p> : null}
          </div>
        </div>
      )}

      {error ? <p role="alert" className="mt-4 rounded-control border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {message ? <p className="mt-4 rounded-control border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p> : null}
    </Card>
  );
}
