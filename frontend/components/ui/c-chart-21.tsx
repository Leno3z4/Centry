"use client";

import { useMemo } from "react";
import { Cell, Pie, PieChart } from "recharts";
import {
  ChartContainer,
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
  color?: string;
};

type AgentPortfolioChartProps = {
  rows: AgentPortfolioChartRow[];
  totalUsd: number;
  formatUsd: (value: number | null) => string;
};

const FALLBACK_COLORS: Record<string, string> = {
  native: "#4f8cff",
  eurc: "#33c3a6",
  cirbtc: "#f97316",
};

function formatLabel(row: AgentPortfolioChartRow) {
  return row.key === "native" ? "USDC" : row.label;
}

function formatPercentage(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0%";
  return value < 10 ? `${value.toFixed(1)}%` : `${value.toFixed(0)}%`;
}

export function AgentPortfolioChart({
  rows,
  totalUsd,
  formatUsd,
}: AgentPortfolioChartProps) {
  const visibleRows = useMemo(
    () => rows.filter((row) => Number.isFinite(row.usdValue) && (row.usdValue || 0) > 0),
    [rows],
  );

  const chartData = visibleRows.map((row) => ({
    asset: row.key,
    value: row.usdValue || 0,
    fill: `var(--color-${row.key})`,
  }));

  const chartConfig = visibleRows.reduce<ChartConfig>((config, row) => {
    config[row.key] = {
      label: formatLabel(row),
      color: row.color || FALLBACK_COLORS[row.key] || "#73767d",
    };
    return config;
  }, {});

  return (
    <div className="grid min-w-0 gap-5">
      <div className="relative mx-auto w-full max-w-[330px]">
        <ChartContainer config={chartConfig} className="mx-auto aspect-square max-h-[300px] w-full">
          <PieChart accessibilityLayer>
            <defs>
              <pattern
                id="agent-portfolio-native-pattern"
                patternUnits="userSpaceOnUse"
                width="6"
                height="6"
              >
                <rect width="6" height="6" fill="var(--color-native)" opacity="0.2" />
                <path
                  d="M0,6 L6,0 M-2,2 L2,-2 M4,8 L8,4"
                  stroke="var(--color-native)"
                  strokeWidth="1.25"
                  opacity="0.9"
                />
              </pattern>
              <pattern
                id="agent-portfolio-eurc-pattern"
                patternUnits="userSpaceOnUse"
                width="5"
                height="5"
              >
                <rect width="5" height="5" fill="var(--color-eurc)" opacity="0.2" />
                <circle
                  cx="2.5"
                  cy="2.5"
                  r="1.1"
                  fill="var(--color-eurc)"
                  opacity="0.7"
                />
              </pattern>
            </defs>

            <ChartTooltip
              content={
                <ChartTooltipContent
                  className="min-w-48 gap-2.5"
                  formatter={(value, name) => (
                    <div className="flex w-full items-center justify-between gap-3">
                      <span className="text-muted-foreground">
                        {chartConfig[String(name)]?.label || name}
                      </span>
                      <span className="font-mono font-semibold tabular-nums text-foreground">
                        {formatUsd(Number(value))}
                      </span>
                    </div>
                  )}
                />
              }
            />

            <Pie
              data={chartData}
              dataKey="value"
              nameKey="asset"
              innerRadius={62}
              outerRadius={100}
              cornerRadius={5}
              paddingAngle={3}
              stroke="#080808"
              strokeWidth={3}
            >
              {chartData.map((entry, index) => {
                const fill =
                  entry.asset === "native" && index === 0
                    ? "url(#agent-portfolio-native-pattern)"
                    : entry.asset === "eurc" && index === 1
                      ? "url(#agent-portfolio-eurc-pattern)"
                      : entry.fill;
                return <Cell key={entry.asset} fill={fill} />;
              })}
            </Pie>
          </PieChart>
        </ChartContainer>

        <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">
          <strong className="text-2xl font-semibold tracking-tight text-foreground">
            {formatUsd(totalUsd)}
          </strong>
          <span className="mt-1 text-xs text-muted-foreground">Total value</span>
        </div>
      </div>

      {visibleRows.length ? (
        <div className="grid gap-2">
          {visibleRows.map((row) => (
            <div
              key={row.key}
              className="flex items-center justify-between gap-4 rounded-xl border border-border/70 bg-background px-3 py-2.5"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{
                    backgroundColor:
                      row.color || FALLBACK_COLORS[row.key] || "#73767d",
                  }}
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {formatLabel(row)}
                  </p>
                  <p className="truncate text-xs tabular-nums text-muted-foreground">
                    {row.amount}
                  </p>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-medium tabular-nums text-foreground">
                  {formatUsd(row.usdValue)}
                </p>
                <p className="text-xs tabular-nums text-muted-foreground">
                  {formatPercentage(row.percentage)}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-border/70 bg-background px-4 py-5 text-center">
          <p className="text-sm font-medium text-foreground">No priced assets yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Portfolio allocation appears here when an asset has a USD price feed.
          </p>
        </div>
      )}
    </div>
  );
}

export default AgentPortfolioChart;
