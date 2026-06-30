import { FormEvent, useState } from "react";
import { Building2 } from "lucide-react";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { useAppState } from "../state/store";

export function Onboarding() {
  const { dispatch } = useAppState();
  const [name, setName] = useState("");
  const [subtitle, setSubtitle] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    dispatch({ type: "create_organization", name: name.trim(), subtitle: subtitle.trim() || undefined });
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4 py-8 text-text">
      <Card className="w-full max-w-lg">
        <div className="mb-8">
          <p className="text-sm font-bold tracking-normal text-[#1D2A31]">ORÁCULO</p>
          <h1 className="mt-3 text-2xl font-semibold text-text">Crie a primeira empresa</h1>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            A empresa nasce vazia. Depois você cria áreas, coordenadores e começa pelo Plano Estratégico.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-text">Nome da empresa</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex: GAAM"
              className="h-11 w-full rounded-xl border border-border bg-white px-3 text-sm"
              required
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-text">Subtítulo</span>
            <input
              value={subtitle}
              onChange={(event) => setSubtitle(event.target.value)}
              placeholder="Ex: Aize"
              className="h-11 w-full rounded-xl border border-border bg-white px-3 text-sm"
            />
          </label>
          <Button type="submit" icon={Building2} className="w-full">
            Criar empresa
          </Button>
        </form>
      </Card>
    </main>
  );
}
