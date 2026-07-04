import { Badge } from "./ui";
import { formatPercent } from "@/lib/utils";
import type { MarginHealth } from "@/lib/costing";

const tone: Record<MarginHealth, string> = {
  red: "red",
  yellow: "yellow",
  green: "green",
};

const dot: Record<MarginHealth, string> = {
  red: "bg-risk-500",
  yellow: "bg-watch-500",
  green: "bg-mint-500",
};

export function MarginPill({
  health,
  pct,
}: {
  health: MarginHealth;
  pct: number;
}) {
  return (
    <Badge tone={tone[health]}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot[health]}`} />
      {formatPercent(pct)}
    </Badge>
  );
}
