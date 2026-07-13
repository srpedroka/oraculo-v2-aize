import { FormEvent, useState } from "react";
import { Eye, EyeOff, KeyRound, Mail } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { useAppState } from "../state/store";

export function PasswordRecovery() {
  const { session, resetPasswordForEmail, updatePassword } = useAppState();
  const navigate = useNavigate();
  const [email, setEmail] = useState(session?.user.email ?? "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function requestReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      await resetPasswordForEmail(email.trim());
      setMessage("Enviamos um link para redefinir sua senha. Abra o email e siga para criar a nova senha.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível enviar o link agora.");
    } finally {
      setBusy(false);
    }
  }

  async function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      if (password !== confirmPassword) {
        setMessage("As senhas precisam ser iguais.");
        return;
      }

      await updatePassword(password);
      setMessage("Senha atualizada.");
      navigate("/", { replace: true });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível atualizar a senha agora.");
    } finally {
      setBusy(false);
    }
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
                  className="h-11 w-full rounded-xl border border-border bg-white px-3 pr-11 text-sm"
                  minLength={6}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-[10px] text-text-secondary hover:bg-[#F0F0F2]"
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
                  className="h-11 w-full rounded-xl border border-border bg-white px-3 pr-11 text-sm"
                  minLength={6}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((current) => !current)}
                  className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-[10px] text-text-secondary hover:bg-[#F0F0F2]"
                  aria-label={showConfirmPassword ? "Ocultar senha" : "Mostrar senha"}
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </label>

            {message ? (
              <p role="status" aria-live="polite" className="rounded-xl border border-border bg-[#FAFAFB] px-3 py-2 text-sm leading-6 text-text-secondary">
                {message}
              </p>
            ) : null}

            <Button type="submit" className="w-full" icon={KeyRound} disabled={busy}>
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
                className="h-11 w-full rounded-xl border border-border bg-white px-3 text-sm"
                required
              />
            </label>

            {message ? (
              <p role="status" aria-live="polite" className="rounded-xl border border-border bg-[#FAFAFB] px-3 py-2 text-sm leading-6 text-text-secondary">
                {message}
              </p>
            ) : null}

            <Button type="submit" className="w-full" icon={Mail} disabled={busy}>
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
