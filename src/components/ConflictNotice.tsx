import { RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "./ui/Button";

interface ConflictNoticeProps {
  onReload: () => void;
  label?: string;
}

export function ConflictNotice({ onReload, label = "Este dado foi alterado em outra sessão. Seu rascunho não foi sobrescrito." }: ConflictNoticeProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-text" role="alert">
      <span className="flex min-w-0 items-start gap-2">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
        <span>{label}</span>
      </span>
      <Button type="button" size="sm" variant="ghost" icon={RefreshCw} onClick={onReload}>
        Recarregar versão atual
      </Button>
    </div>
  );
}
