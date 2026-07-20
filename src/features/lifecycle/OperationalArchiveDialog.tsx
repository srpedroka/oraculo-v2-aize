import { Archive, X } from "lucide-react";
import { FormEvent, useState } from "react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { InlineFeedback } from "../../components/ui/InlineFeedback";
import type { RecoverableFeedback } from "../../lib/uiFeedback";

interface OperationalArchiveDialogProps {
  eyebrow: string;
  title: string;
  description: string;
  impacts?: string[];
  confirmLabel?: string;
  busy?: boolean;
  error?: string | RecoverableFeedback | null;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}

export function OperationalArchiveDialog({
  eyebrow,
  title,
  description,
  impacts = [],
  confirmLabel = "Retirar da operação",
  busy = false,
  error,
  onClose,
  onConfirm,
}: OperationalArchiveDialogProps) {
  const [reason, setReason] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onConfirm(reason.trim());
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4 backdrop-blur-[2px]">
      <Card className="max-h-[92vh] w-full max-w-lg overflow-auto p-0" role="dialog" aria-modal="true" aria-labelledby="operational-archive-title">
        <form onSubmit={submit}>
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
            <div className="min-w-0">
              <p className="text-xs font-medium text-text-tertiary">{eyebrow}</p>
              <h2 id="operational-archive-title" className="mt-1 text-lg font-semibold leading-6 text-text">{title}</h2>
            </div>
            <Button variant="quiet" size="icon" icon={X} onClick={onClose} disabled={busy} aria-label="Fechar" />
          </div>

          <div className="space-y-4 px-5 py-5 sm:px-6">
            <p className="text-sm leading-6 text-text-secondary">{description}</p>

            {impacts.length ? (
              <div className="border-l-2 border-border pl-3">
                {impacts.map((impact) => (
                  <p key={impact} className="text-sm leading-6 text-text-secondary">{impact}</p>
                ))}
              </div>
            ) : null}

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-text">Motivo</span>
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={3}
                maxLength={500}
                placeholder="Ex.: prioridade substituída, registro duplicado ou correção de lançamento"
                className="w-full rounded-control border border-border bg-white px-3 py-2 text-sm leading-6 text-text"
              />
            </label>

            {error ? (
              <InlineFeedback
                tone="error"
                title={typeof error === "string" ? error : error.title}
                description={typeof error === "string" ? undefined : error.description}
                occurrenceId={typeof error === "string" ? undefined : error.occurrenceId}
              />
            ) : null}
          </div>

          <div className="flex flex-wrap justify-end gap-3 border-t border-border px-5 py-4 sm:px-6">
            <Button variant="ghost" onClick={onClose} disabled={busy}>Cancelar</Button>
            <Button type="submit" variant="danger" icon={Archive} loading={busy}>{confirmLabel}</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
