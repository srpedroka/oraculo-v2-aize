import { FormEvent, useState } from "react";
import { Eye, EyeOff, LogIn, UserPlus } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { fieldControlClassName } from "../components/ui/Field";
import { InlineFeedback } from "../components/ui/InlineFeedback";
import { recoverableFeedback, type RecoverableFeedback } from "../lib/uiFeedback";
import { useAppState } from "../state/store";

type AuthMode = "signin" | "signup";
type AuthFeedback = (RecoverableFeedback & { tone: "error" }) | { tone: "success"; title: string; description: string };

function authErrorFeedback(error: unknown, mode: AuthMode) {
  const rawMessage = error instanceof Error ? error.message.toLowerCase() : "";
  const fallbackTitle = mode === "signin" ? "Não consegui entrar agora." : "Não consegui criar o acesso agora.";
  const feedback = recoverableFeedback(
    error,
    fallbackTitle,
    "Seus dados continuam preenchidos. Confira as informações e tente novamente.",
    mode === "signin" ? "AUTH_SIGN_IN_FAILED" : "AUTH_SIGN_UP_FAILED",
  );
  if (rawMessage.includes("invalid login credentials")) return { ...feedback, title: "Email ou senha não conferem." };
  if (rawMessage.includes("email not confirmed")) return { ...feedback, title: "Confirme seu email antes de entrar." };
  if (rawMessage.includes("already registered")) return { ...feedback, title: "Este email já possui cadastro." };
  return { ...feedback, title: fallbackTitle };
}

export function Auth() {
  const { signIn, signUp } = useAppState();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [feedback, setFeedback] = useState<AuthFeedback | null>(null);
  const [busy, setBusy] = useState(false);

  async function performAuth() {
    if (busy) return;
    setBusy(true);
    setFeedback(null);

    try {
      if (mode === "signup") {
        await signUp(email, password, fullName);
        setFeedback({
          tone: "success",
          title: "Cadastro iniciado",
          description: "Se pedirmos confirmação por email, confirme e entre novamente.",
        });
      } else {
        await signIn(email, password);
      }
    } catch (error) {
      setFeedback({ tone: "error", ...authErrorFeedback(error, mode) });
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void performAuth();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4 py-8 text-text">
      <Card className="w-full max-w-md">
        <div className="mb-8">
          <p className="text-sm font-bold tracking-normal text-[#1D2A31]">ORÁCULO</p>
          <h1 className="mt-3 text-2xl font-semibold text-text">
            {mode === "signin" ? "Entrar no sistema" : "Criar primeiro acesso"}
          </h1>
        </div>

        <form onSubmit={submit} className="space-y-4">
          {mode === "signup" ? (
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-text">Nome</span>
              <input
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                className={[fieldControlClassName, "h-11"].join(" ")}
                required
              />
            </label>
          ) : null}

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

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-text">Senha</span>
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

          {mode === "signin" ? (
            <div className="flex justify-end">
              <Link to="/redefinir-senha" className="text-sm font-medium text-accent">
                Esqueci minha senha
              </Link>
            </div>
          ) : null}

          {feedback ? (
            <InlineFeedback
              tone={feedback.tone}
              title={feedback.title}
              description={feedback.description}
              occurrenceId={"occurrenceId" in feedback ? feedback.occurrenceId : undefined}
              actionLabel={feedback.tone === "error" ? "Tentar novamente" : undefined}
              onAction={feedback.tone === "error" ? () => void performAuth() : undefined}
              actionLoading={busy}
            />
          ) : null}

          <Button type="submit" className="w-full" icon={mode === "signin" ? LogIn : UserPlus} loading={busy}>
            {busy ? "Aguarde" : mode === "signin" ? "Entrar" : "Criar acesso"}
          </Button>
        </form>

        <button
          type="button"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setFeedback(null);
          }}
          className="mt-5 w-full text-center text-sm font-medium text-accent"
        >
          {mode === "signin" ? "Criar uma conta" : "Já tenho conta"}
        </button>

        <p className="mt-5 border-t border-border pt-4 text-center text-xs text-text-tertiary">
          <Link to="/privacidade" className="font-medium hover:text-text hover:underline">
            Privacidade e uso de dados
          </Link>
        </p>
      </Card>
    </main>
  );
}
