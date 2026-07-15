import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { PersonalAccountCard } from "../features/account/PersonalAccountCard";

export function PersonalAccount() {
  const navigate = useNavigate();
  return (
    <main className="min-h-screen bg-bg px-4 py-8 text-text">
      <div className="mx-auto w-full max-w-3xl space-y-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-text-tertiary">Conta pessoal</p>
            <h1 className="text-2xl font-semibold text-text">Dados e acesso</h1>
          </div>
          <Button variant="ghost" icon={ArrowLeft} onClick={() => navigate("/", { replace: true })}>Voltar</Button>
        </div>
        <PersonalAccountCard />
      </div>
    </main>
  );
}
