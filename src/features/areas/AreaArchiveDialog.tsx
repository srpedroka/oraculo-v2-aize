import { Archive, X } from "lucide-react";
import type { Area } from "../../types";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";

interface AreaArchiveDialogProps {
  area: Area;
  impact: {
    objectives: number;
    documents: number;
    checkIns: number;
  };
  busy: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: () => void;
}

function recordLabel(value: number, singular: string, plural: string) {
  return value === 1 ? singular : plural;
}

export function AreaArchiveDialog({ area, impact, busy, error, onClose, onConfirm }: AreaArchiveDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-labelledby="archive-area-title">
      <Card className="w-full max-w-lg p-0">
        <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
          <div>
            <p className="text-xs font-medium text-text-tertiary">Área</p>
            <h2 id="archive-area-title" className="mt-1 text-lg font-semibold text-text">Arquivar {area.name}?</h2>
          </div>
          <Button variant="quiet" size="icon" icon={X} onClick={onClose} disabled={busy} aria-label="Fechar" />
        </div>

        <div className="space-y-4 px-6 py-5">
          <p className="text-sm leading-6 text-text-secondary">
            A área sairá do Dashboard, dos planejamentos ativos, dos seletores e do WhatsApp. Todo o histórico continuará guardado e poderá ser restaurado.
          </p>
          <div className="grid grid-cols-3 gap-3 border-y border-border py-4 text-center">
            <div>
              <p className="text-lg font-semibold text-text">{impact.objectives}</p>
              <p className="mt-1 text-xs text-text-secondary">{recordLabel(impact.objectives, "objetivo", "objetivos")}</p>
            </div>
            <div>
              <p className="text-lg font-semibold text-text">{impact.documents}</p>
              <p className="mt-1 text-xs text-text-secondary">{recordLabel(impact.documents, "documento", "documentos")}</p>
            </div>
            <div>
              <p className="text-lg font-semibold text-text">{impact.checkIns}</p>
              <p className="mt-1 text-xs text-text-secondary">{recordLabel(impact.checkIns, "check-in", "check-ins")}</p>
            </div>
          </div>
          {error ? <p className="rounded-control bg-status-danger-bg px-3 py-2 text-sm text-status-danger">{error}</p> : null}
        </div>

        <div className="flex justify-end gap-3 border-t border-border px-6 py-4">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button icon={Archive} loading={busy} onClick={onConfirm}>Arquivar área</Button>
        </div>
      </Card>
    </div>
  );
}
