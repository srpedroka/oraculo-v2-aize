import type { Status } from "../../types";
import { STATUS_LABEL } from "../../types";

const STATUS_STYLES: Record<Status, { className: string; dot: string }> = {
  on_track: { className: "bg-status-success-bg text-status-success", dot: "bg-status-success" },
  at_risk: { className: "bg-status-warning-bg text-status-warning", dot: "bg-status-warning" },
  late: { className: "bg-status-danger-bg text-status-danger", dot: "bg-status-danger" },
  done: { className: "bg-fill-active text-accent", dot: "bg-accent" },
};

export function StatusBadge({ status, className = "" }: { status: Status; className?: string }) {
  const style = STATUS_STYLES[status];

  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 rounded-control px-2.5 py-1 text-xs font-medium",
        style.className,
        className,
      ].join(" ")}
    >
      <span className={["h-1.5 w-1.5 rounded-full", style.dot].join(" ")} />
      {STATUS_LABEL[status]}
    </span>
  );
}
