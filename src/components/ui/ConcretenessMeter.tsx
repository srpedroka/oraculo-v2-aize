import type { Objective, PlanLevel } from "../../types";
import { evaluateConcreteness } from "../../lib/concreteness";

interface ConcretenessMeterProps {
  objective: Pick<Objective, "level" | "result" | "deadline" | "owner" | "parentId" | "evidencePlan">;
  compact?: boolean;
}

const RANGE_COLORS = {
  Direcional: "bg-[#FBE9E7]",
  "Em forma": "bg-[#FDF1DD]",
  Concreto: "bg-[#E6F4EA]",
};

const ACTIVE_COLORS = {
  Direcional: "bg-[#D65B4A]",
  "Em forma": "bg-[#C5851C]",
  Concreto: "bg-[#1D7A3E]",
};

export function expectedLabel(level: PlanLevel) {
  if (level === "strategic") return "Direcional";
  if (level === "area_annual") return "Em forma";
  return "Concreto";
}

export function ConcretenessMeter({ objective, compact = false }: ConcretenessMeterProps) {
  const result = evaluateConcreteness(objective);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1" aria-label={`Concretude: ${result.score} de 5`}>
        {Array.from({ length: 5 }).map((_, index) => (
          <span
            key={index}
            className={[
              "h-2 rounded-full",
              compact ? "w-5" : "w-7",
              index < result.score ? ACTIVE_COLORS[result.range] : "bg-[#ECECEF]",
            ].join(" ")}
          />
        ))}
      </div>
      <span
        className={[
          "rounded-[10px] px-2 py-0.5 text-xs font-medium text-text",
          RANGE_COLORS[result.range],
        ].join(" ")}
      >
        {result.range}
      </span>
      {result.belowRecommended ? (
        <span className="rounded-[10px] bg-[#F0F0F2] px-2 py-0.5 text-xs font-medium text-text-secondary">
          Em evolução
        </span>
      ) : null}
    </div>
  );
}
