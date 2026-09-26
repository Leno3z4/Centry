"use client";

import { CSSProperties, useMemo } from "react";
import { Cell, Pie, PieChart } from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

export type AgentPortfolioChartRow = {
  key: string;
  label: string;
  amount: string;
  usdValue: number | null;
  percentage: number;
};

type AgentPortfolioChartProps = {
  rows: AgentPortfolioChartRow[];
  totalUsd: number;
  formatUsd: (value: number | null) => string;
};

const palette: Record<string, string> = {
  native: "#4f8cff",
  eurc: "#33c3a6",
  cirbtc: "#f97316",
};

function formatLabel(row: AgentPortfolioChartRow) {
  return row.key === "native" ? "USDC" : row.label;
}

export function AgentPortfolioChart({ rows, totalUsd, formatUsd }: AgentPortfolioChartProps) {
  const visibleRows = useMemo(
    () => rows.filter((row) => Number.isFinite(row.usdValue) && (row.usdValue || 0) > 0),
    [rows],
  );

  const chartData = visibleRows.map((row) => ({
    asset: row.key,
    value: row.usdValue || 0,
    fill: `var(--color-${row.key})`,
  }));

  const chartConfig = visibleRows.reduce<ChartConfig>(
    (config, row) => ({
      ...config,
      [row.key]: {
        label: formatLabel(row),
        color: row.color || palette[row.key] || "#73767d",
      },
    }),
    {},
  );

  return (
    <div className="w-full min-w-0">
      <ChartContainer config={chartConfig} className="mx-auto aspect-square max-h-[300px] w-full">
        <PieChart accessibilityLayer>
          <defs>
            <pattern id="agent-portfolio-native-pattern" patternUnits="userSpaceOnUse" width="6" height="6">
              <rect width="6" height="6" fill="var(--color-native)" opacity="0.2" />
              <path d="M0,6 L6,0 M-2,2 L2,-2 M4,8 L8,4" stroke="var(--color-native)" strokeWidth="1.25" opacity="0.9" />
            </pattern>
            <pattern id="agent-portfolio-eurc-pattern" patternUnits="userSpaceOnUse" width="5" height="5">
              <rect width="5" height="5" fill="var(--color-eurc)" opacity="0.2" />
              <circle cx="2.5" cy="2.5" r="1.1" fill="var(--color-eurc)" opacity="0.7" />
            </pattern>
          </defs>
          <ChartTooltip
            content={
              <ChartTooltipContent
                className="min-w-48 gap-2.5"
                formatter={(value, name) => (
                  <div className="flex w-full items-center justify-between gap-3">
                    <span className="text-muted-foreground">{chartConfig[String(name)]?.label || name}</span>
                    <span className="font-mono font-semibold tabular-nums text-foreground">
                      {formatUsd(Number(value))}
                    </span>
                  </div>
                )}
              />
            }
          />
          <ChartLegend
            content={<ChartLegendContent nameKey="asset" />}
            className="-translate-y-2"
          />
          <Pie
            data={chartData}
            dataKey="value"
            nameKey="asset"
            innerRadius={58}
            outerRadius={94}
            cornerRadius={4}
            paddingAngle={3}
            stroke="#080808"
            strokeWidth={3}
          >
            {chartData.map((entry, index) => {
              const fill =
                index % 3 === 0 && entry.asset === "native"
                  ? "url(#agent-portfolio-native-pattern)"
                  : index % 3 === 2 && entry.asset === "eurc"
                    ? "url(#agent-portfolio-eurc-pattern)"
                    : entry.fill;
              return <Cell key={entry.asset} fill={fill} />;
            })}
          </Pie>
        </PieChart>
      </ChartContainer>

      <div className="-mt-1 text-center">
        <strong className="text-2xl font-semibold tracking-tight text-foreground">{formatUsd(totalUsd)}</strong>
        <p className="mt-1 text-xs text-muted-foreground">Total value</p>
      </div>
    </div>
  );
}

export default AgentPortfolioChart;
