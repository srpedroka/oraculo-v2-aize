import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { Sprout, Trophy, TrendingUp } from "lucide-react";
import { Card } from "../components/ui/Card";
import { ProgressBar } from "../components/ui/ProgressBar";
import { StatusBadge } from "../components/ui/StatusBadge";
import { useAppState } from "../state/store";

export function Dashboard() {
  const { state } = useAppState();
  const revenue = state.objectives.find((objective) => objective.id === "e1");
  const margin = state.objectives.find((objective) => objective.id === "e2") ?? state.objectives.find((objective) => objective.metric?.toLowerCase().includes("margem"));
  const leadership = state.objectives.find((objective) => objective.id === "e4") ?? state.objectives.find((objective) => objective.title.toLowerCase().includes("líder"));
  const productDelay = state.objectives.find((objective) => objective.id === "q-inov-1") ?? state.objectives.find((objective) => objective.type === "seed" && objective.status === "late");
  const hasData = state.objectives.length > 0;
  const seedObjectives = state.objectives.filter((objective) => objective.type === "seed");
  const activeSeeds = seedObjectives.filter((objective) => objective.status !== "done");
  const onTrackSeeds = activeSeeds.filter((objective) => objective.status === "on_track").length;
  const attentionSeeds = activeSeeds.filter((objective) => ["at_risk", "late"].includes(objective.status)).length;
  const productProjectCount = seedObjectives.filter((objective) => /produto|pipeline|protótipo|inova/i.test(objective.title)).length;
  const donutData = activeSeeds.length
    ? [
        { name: "No Prazo", value: onTrackSeeds, color: "#DDE7F3" },
        { name: "Em Risco", value: attentionSeeds, color: "#F2C28D" },
      ].filter((item) => item.value > 0)
    : [{ name: "Sem dados", value: 1, color: "#ECECEF" }];

  return (
    <div className="mx-auto max-w-[820px] space-y-7">
      <div>
        <p className="text-sm font-medium text-text-tertiary">
          {state.organization?.name}
          {state.organization?.subtitle ? ` · ${state.organization.subtitle}` : ""}
        </p>
        <h1 className="text-2xl font-semibold text-text">Dashboard executivo</h1>
      </div>

      {!hasData ? (
        <Card>
          <p className="text-base font-semibold text-text">A empresa está pronta para começar.</p>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            Crie o Plano Estratégico e as áreas para o Oráculo mostrar Resultado e Evolução ao vivo.
          </p>
        </Card>
      ) : null}

      <section className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Trophy className="h-5 w-5 text-[#9A6400]" />
          <h2 className="text-[20px] font-semibold text-text">Resultado</h2>
          <span className="text-[18px] text-text-secondary">(Jogo Atual)</span>
        </div>
        <div className="rounded-[22px] border border-border bg-white/70 p-3 shadow-card">
          <div className="grid gap-3 lg:grid-cols-2">
            <Card className="rounded-2xl shadow-card">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[16px] font-medium text-text">Faturamento (Mensal)</p>
                  <p className="mt-6 text-[36px] font-semibold leading-none text-text">{revenue?.current ?? "-"}</p>
                  <p className="mt-3 text-[15px] text-text-secondary">Meta: {revenue?.target ?? "A definir"}</p>
                </div>
                {revenue ? (
                  <span className="inline-flex items-center gap-1 rounded-[10px] bg-[#E6F4EA] px-2.5 py-1 text-sm font-medium text-[#1D7A3E]">
                    <TrendingUp className="h-3.5 w-3.5" />
                    4%
                  </span>
                ) : (
                  <span className="rounded-[10px] bg-[#ECECEF] px-2.5 py-1 text-sm font-medium text-text-secondary">A definir</span>
                )}
              </div>
            </Card>

            <Card className="rounded-2xl shadow-card">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[16px] font-medium text-text">Margem Operacional</p>
                  <p className="mt-6 text-[36px] font-semibold leading-none text-text">{margin?.current ?? "-"}</p>
                  <p className="mt-3 text-[15px] text-text-secondary">Meta: {margin?.target ?? "A definir"}</p>
                </div>
                <span className="rounded-[10px] bg-[#ECECEF] px-2.5 py-1 text-sm font-medium text-text-secondary">Estável</span>
              </div>
            </Card>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Sprout className="h-5 w-5 text-[#9A6400]" />
          <h2 className="text-[20px] font-semibold text-text">Evolução</h2>
          <span className="text-[18px] text-text-secondary">(Próximo Jogo)</span>
        </div>

        <div className="space-y-4">
          <Card className="rounded-2xl">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[17px] font-medium text-text">Pipeline de Novos Produtos</p>
                <p className="mt-4 text-[34px] font-semibold leading-none text-text">{productProjectCount} Projetos</p>
                <p className="mt-3 text-[15px] text-text-secondary">{productProjectCount ? "Fase: Validação" : "Fase: A definir"}</p>
              </div>
              <span className="rounded-[12px] bg-[#FDF1DD] px-3 py-1.5 text-sm font-medium text-[#9A6400]">
                {productDelay?.status === "late" ? "1 Atrasado" : productProjectCount ? "Em atenção" : "A definir"}
              </span>
            </div>
          </Card>

          <Card className="rounded-2xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-[17px] font-medium text-text">Treinamento de Liderança Aize</p>
                <p className="mt-4 text-[34px] font-semibold leading-none text-text">{leadership?.progress ?? 0}%</p>
              </div>
              <StatusBadge status="on_track" />
            </div>
            <ProgressBar value={leadership?.progress ?? 0} />
          </Card>

          <Card className="rounded-2xl">
            <div className="grid grid-cols-[1fr_112px] items-center gap-4">
              <div>
                <p className="text-[17px] font-medium text-text">Iniciativas de Inovação</p>
                <p className="mt-4 text-[34px] font-semibold leading-none text-text">{activeSeeds.length} Em Andamento</p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <span className="text-[15px] text-text-secondary">{onTrackSeeds} No Prazo</span>
                  <span className="rounded-[12px] bg-[#FDF1DD] px-3 py-1.5 text-sm font-medium text-[#9A6400]">
                    {attentionSeeds} Em Risco
                  </span>
                </div>
              </div>
              <div className="h-28 w-28">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={donutData}
                      dataKey="value"
                      innerRadius={34}
                      outerRadius={50}
                      paddingAngle={3}
                      isAnimationActive={false}
                    >
                      {donutData.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} stroke="#CCD4DE" />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </Card>
        </div>
      </section>
    </div>
  );
}
