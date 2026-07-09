import { Bar, ComposedChart, Line, ResponsiveContainer, Tooltip } from "recharts";

interface KpiSparklineProps {
  data: Array<{
    month: string;
    actual: number | null;
    target?: number | null;
  }>;
  showTarget?: boolean;
}

export function KpiSparkline({ data, showTarget = true }: KpiSparklineProps) {
  const hasData = data.some((item) => item.actual !== null || item.target !== null);

  if (!hasData) {
    return <div className="h-16 rounded-lg border border-dashed border-border bg-white/60" />;
  }

  return (
    <div className="h-16">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 6, bottom: 0, left: 6 }}>
          <Tooltip
            cursor={{ fill: "rgba(135, 153, 173, 0.08)" }}
            contentStyle={{
              border: "1px solid #DDE3EA",
              borderRadius: 8,
              boxShadow: "0 10px 28px rgba(23, 32, 42, 0.08)",
              fontSize: 12,
            }}
            formatter={(value, name) => [value === null || value === undefined ? "—" : value, name === "target" ? "Meta" : "Realizado"]}
            labelFormatter={(label) => label}
          />
          <Bar dataKey="actual" fill="#8799AD" radius={[4, 4, 0, 0]} barSize={10} isAnimationActive={false} />
          {showTarget ? <Line type="monotone" dataKey="target" stroke="#B78732" strokeWidth={2} dot={false} isAnimationActive={false} /> : null}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
