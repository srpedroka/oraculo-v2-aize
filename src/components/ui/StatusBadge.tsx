import type { Status } from "../../types";
import { STATUS_LABEL } from "../../types";

const STATUS_STYLES: Record<Status, { className: string; dot: string }> = {
  on_track: { className: "bg-[#E6F4EA] text-[#1D7A3E]", dot: "bg-[#1D7A3E]" },
  at_risk: { className: "bg-[#FDF1DD] text-[#9A6400]", dot: "bg-[#9A6400]" },
  late: { className: "bg-[#FBE9E7] text-[#B42318]", dot: "bg-[#B42318]" },
  done: { className: "bg-[#ECECEF] text-[#2E2E33]", dot: "bg-[#2E2E33]" },
};

export function StatusBadge({ status, className = "" }: { status: Status; className?: string }) {
  const style = STATUS_STYLES[status];

  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 rounded-[10px] px-2.5 py-1 text-xs font-medium",
        style.className,
        className,
      ].join(" ")}
    >
      <span className={["h-1.5 w-1.5 rounded-full", style.dot].join(" ")} />
      {STATUS_LABEL[status]}
    </span>
  );
}
