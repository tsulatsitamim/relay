import type { ReactNode } from "react";

export type BannerItem = {
  id: string;
  kind: "approval" | "error" | "tasks";
  node: ReactNode;
};

const KIND_ORDER: Record<BannerItem["kind"], number> = {
  approval: 0,
  error: 1,
  tasks: 2,
};

export function BannerStack({ items }: { items: BannerItem[] }) {
  if (items.length === 0) return null;
  const ordered = items
    .map((item, index) => ({ item, index }))
    .sort(
      (a, b) =>
        KIND_ORDER[a.item.kind] - KIND_ORDER[b.item.kind] || a.index - b.index,
    )
    .map((entry) => entry.item);
  const peek = items.length > 3;

  return (
    <div className="banner-stack" data-peek={peek ? "true" : undefined}>
      {ordered.map((item) => (
        <div className="banner-slot" data-kind={item.kind} key={item.id}>
          <div className="banner-slot-inner">{item.node}</div>
        </div>
      ))}
      {peek ? <div className="banner-peek">{items.length - 3} more</div> : null}
    </div>
  );
}