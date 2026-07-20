import { FormEvent, useState } from "react";
import { Eye, EyeOff, KeyRound, Mail } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { fieldControlClassName } from "../components/ui/Field";
import { InlineFeedback, type InlineFeedbackTone } from "../components/ui/InlineFeedback";
import { recoverableFeedback } from "../lib/uiFeedback";
import { useAppState } from "../state/store";

type PasswordFeedback = {
  tone: InlineFeedbackTone;
  title: string;
  description?: string;
  occurrenceId?: string;
};

export function PasswordRecovery() {
  const { session, resetPasswordForEmail, updatePassword } = useAppState();
  const navigate = useNavigate();
  const [email, setEmail] = useState(session?.user.email ?? "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [feedback, setFeedback] = useState<PasswordFeedback | null>(null);
  const [busy, setBusy] = useState(false);

  async function performResetRequest() {
    if (busy) return;
    setBusy(true);
    setFeedback(null);

    try {
      await resetPasswordForEmail(email.trim());
      setFeedback({
        tone: "success",
        title: "Link enviado",
        description: "Abra o email e siga o link para criar uma nova senha.",
      });
    } catch (error) {
      const recovered = recoverableFeedback(
        error,
        "Não consegui enviar o link agora.",
        "O email continua preenchido. Confira o endereço e tente novamente.",
        "PASSWORD_RESET_REQUEST_FAILED",
      );
      setFeedback({ ...recovered, title: "Não consegui enviar o link agora.", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function performPasswordSave() {
    if (busy) return;
    if (password !== confirmPassword) {
      setFeedback({ tone: "warning", title: "As senhas precisam ser iguais." });
      return;
    }
    setBusy(true);
    setFeedback(null);

    try {
      await updatePassword(password);
      setFeedback({ tone: "success", title: "Senha atualizada." });
      navigate("/", { replace: true });
    } catch (error) {
      const recovered = recoverableFeedback(
        error,
        "Não consegui atualizar a senha agora.",
        "Os dois campos continuam preenchidos. Tente novamente.",
        "PASSWORD_UPDATE_FAILED",
      );
      setFeedback({ ...recovered, title: "Não consegui atualizar a senha agora.", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  function requestReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void performResetRequest();
  }

  function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void performPasswordSave();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4 py-8 text-text">
      <Card className="w-full max-w-md">
        <div className="mb-8">
          <p className="text-sm font-bold tracking-normal text-[#1D2A31]">ORÁCULO</p>
          <h1 className="mt-3 text-2xl font-semibold text-text">{session ? "Criar nova senha" : "Recuperar senha"}</h1>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            {session ? "Defina uma nova senha para manter seu acesso seguro." : "Digite seu email para receber o link de redefinição."}
          </p>
        </div>

        {session ? (
          <form onSubmit={savePassword} className="space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-text">Nova senha</span>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className={[fieldControlClassName, "h-11 pr-11"].join(" ")}
                  minLength={6}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute right-0.5 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-control text-text-secondary transition-colors duration-fast hover:bg-fill-hover motion-reduce:transition-none"
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-text">Confirmar nova senha</span>
              <div className="relative">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className={[fieldControlClassName, "h-11 pr-11"].join(" ")}
                  minLength={6}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((current) => !current)}
                  className="absolute right-0.5 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-control text-text-secondary transition-colors duration-fast hover:bg-fill-hover motion-reduce:transition-none"
                  aria-label={showConfirmPassword ? "Ocultar senha" : "Mostrar senha"}
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </label>

            {feedback ? (
              <InlineFeedback
                tone={feedback.tone}
                title={feedback.title}
                description={feedback.description}
                occurrenceId={feedback.occurrenceId}
                actionLabel={feedback.tone === "error" ? "Tentar novamente" : undefined}
                onAction={feedback.tone === "error" ? () => void performPasswordSave() : undefined}
                actionLoading={busy}
              />
            ) : null}

            <Button type="submit" className="w-full" icon={KeyRound} loading={busy}>
              {busy ? "Salvando" : "Salvar nova senha"}
            </Button>
          </form>
        ) : (
          <form onSubmit={requestReset} className="space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-text">Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className={[fieldControlClassName, "h-11"].join(" ")}
                required
              />
            </label>

            {feedback ? (
              <InlineFeedback
                tone={feedback.tone}
                title={feedback.title}
                description={feedback.description}
                occurrenceId={feedback.occurrenceId}
                actionLabel={feedback.tone === "error" ? "Tentar novamente" : undefined}
                onAction={feedback.tone === "error" ? () => void performResetRequest() : undefined}
                actionLoading={busy}
              />
            ) : null}

            <Button type="submit" className="w-full" icon={Mail} loading={busy}>
              {busy ? "Enviando" : "Enviar link por email"}
            </Button>
          </form>
        )}

        <Link to="/" className="mt-5 block w-full text-center text-sm font-medium text-accent">
          Voltar para entrar
        </Link>
      </Card>
    </main>
  );
}
