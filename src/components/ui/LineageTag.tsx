import type { Objective } from "../../types";

interface LineageTagProps {
  objective: Objective;
  parent?: Objective;
}

export function LineageTag({ objective, parent }: LineageTagProps) {
  if (objective.level === "strategic") {
    return (
      <span className="inline-flex rounded-[10px] bg-[#F0F0F2] px-2.5 py-1 text-xs font-medium text-text-secondary">
        Conecta ao tema do ano
      </span>
    );
  }

  return (
    <span className="inline-flex max-w-full rounded-[10px] bg-[#F0F0F2] px-2.5 py-1 text-xs font-medium text-text-secondary">
      <span className="truncate">Puxa de: {parent?.title ?? "objetivo superior não definido"}</span>
    </span>
  );
}
