import { CircleCheck, CircleX, Info, RotateCcw, TriangleAlert, type LucideIcon } from "lucide-react";
import { Button } from "./Button";

export type InlineFeedbackTone = "info" | "success" | "warning" | "error";

interface InlineFeedbackProps {
  tone: InlineFeedbackTone;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  actionLoading?: boolean;
  occurrenceId?: string | null;
  className?: string;
}

const TONE: Record<InlineFeedbackTone, { icon: LucideIcon; className: string }> = {
  info: { icon: Info, className: "border-status-info/25 bg-status-info-bg text-status-info" },
  success: { icon: CircleCheck, className: "border-status-success/25 bg-status-success-bg text-status-success" },
  warning: { icon: TriangleAlert, className: "border-status-warning/25 bg-status-warning-bg text-status-warning" },
  error: { icon: CircleX, className: "border-status-danger/25 bg-status-danger-bg text-status-danger" },
};

export function InlineFeedback({
  tone,
  title,
  description,
  actionLabel,
  onAction,
  actionLoading = false,
  occurrenceId,
  className = "",
}: InlineFeedbackProps) {
  const style = TONE[tone];
  const Icon = style.icon;

  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      aria-live={tone === "error" ? "assertive" : "polite"}
      className={["rounded-card border px-3 py-3 text-sm", style.className, className].join(" ")}
    >
      <div className="flex items-start gap-2.5">
        <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-text">{title}</p>
          {description ? <p className="mt-1 leading-5 text-text-secondary">{description}</p> : null}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {actionLabel && onAction ? (
              <Button size="sm" variant="secondary" icon={RotateCcw} loading={actionLoading} onClick={onAction}>
                {actionLabel}
              </Button>
            ) : null}
            {occurrenceId ? (
              <details className="text-caption text-text-secondary">
                <summary className="cursor-pointer font-medium text-text">Detalhes técnicos</summary>
                <p className="mt-1">Código da ocorrência: <code className="font-semibold text-text">{occurrenceId}</code></p>
              </details>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

