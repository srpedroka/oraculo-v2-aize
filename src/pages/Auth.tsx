import { FormEvent, useState } from "react";
import { LogIn, UserPlus } from "lucide-react";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { useAppState } from "../state/store";

type AuthMode = "signin" | "signup";

export function Auth() {
  const { signIn, signUp } = useAppState();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      if (mode === "signup") {
        await signUp(email, password, fullName);
        setMessage("Cadastro iniciado. Se o Supabase pedir confirmação por email, confirme e entre novamente.");
      } else {
        await signIn(email, password);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível acessar agora.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4 py-8 text-text">
      <Card className="w-full max-w-md">
        <div className="mb-8">
          <p className="text-sm font-bold tracking-normal text-[#1D2A31]">ORÁCULO</p>
          <h1 className="mt-3 text-2xl font-semibold text-text">
            {mode === "signin" ? "Entrar no sistema" : "Criar primeiro acesso"}
          </h1>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            A V2 salva os planos por empresa, com permissões por papel e área.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          {mode === "signup" ? (
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-text">Nome</span>
              <input
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                className="h-11 w-full rounded-xl border border-border bg-white px-3 text-sm"
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
              className="h-11 w-full rounded-xl border border-border bg-white px-3 text-sm"
              required
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-text">Senha</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-11 w-full rounded-xl border border-border bg-white px-3 text-sm"
              minLength={6}
              required
            />
          </label>

          {message ? (
            <p className="rounded-xl border border-border bg-[#FAFAFB] px-3 py-2 text-sm leading-6 text-text-secondary">
              {message}
            </p>
          ) : null}

          <Button type="submit" className="w-full" icon={mode === "signin" ? LogIn : UserPlus} disabled={busy}>
            {busy ? "Aguarde" : mode === "signin" ? "Entrar" : "Criar acesso"}
          </Button>
        </form>

        <button
          type="button"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setMessage("");
          }}
          className="mt-5 w-full text-center text-sm font-medium text-accent"
        >
          {mode === "signin" ? "Criar uma conta" : "Já tenho conta"}
        </button>
      </Card>
    </main>
  );
}
