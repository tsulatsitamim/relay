export function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  return `${(n / 1000).toFixed(1)}k`;
}

export function formatUsage(p: {
  used?: number;
  size?: number;
  costAmount?: number;
  costCurrency?: string;
}): string {
  const parts: string[] = [];
  if (typeof p.used === "number" && typeof p.size === "number") {
    parts.push(`${formatTokens(p.used)} / ${formatTokens(p.size)} tokens`);
  } else if (typeof p.used === "number") {
    parts.push(`${formatTokens(p.used)} tokens`);
  }
  if (typeof p.costAmount === "number") {
    parts.push(`${p.costCurrency ?? "$"}${p.costAmount.toFixed(4)}`);
  }
  return parts.join(" · ");
}
