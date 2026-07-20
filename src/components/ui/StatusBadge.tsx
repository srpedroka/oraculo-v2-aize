import type { Status } from "../../types";
import { STATUS_LABEL } from "../../types";

export type StatusBadgeStatus = Status | "unset";

const STATUS_STYLES: Record<StatusBadgeStatus, { className: string; dot: string; label: string }> = {
  on_track: { className: "bg-status-success-bg text-status-success", dot: "bg-status-success", label: STATUS_LABEL.on_track },
  at_risk: { className: "bg-status-warning-bg text-status-warning", dot: "bg-status-warning", label: STATUS_LABEL.at_risk },
  late: { className: "bg-status-danger-bg text-status-danger", dot: "bg-status-danger", label: STATUS_LABEL.late },
  done: { className: "bg-fill-active text-accent", dot: "bg-accent", label: STATUS_LABEL.done },
  unset: { className: "bg-status-neutral-bg text-status-neutral", dot: "bg-status-neutral", label: "Sem avaliação" },
};

export function StatusBadge({ status, className = "" }: { status: StatusBadgeStatus; className?: string }) {
  const style = STATUS_STYLES[status];

  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        style.className,
        className,
      ].join(" ")}
    >
      <span aria-hidden="true" className={["h-1.5 w-1.5 rounded-full", style.dot].join(" ")} />
      {style.label}
    </span>
  );
}
