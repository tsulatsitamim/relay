import type { PlanEntry } from "../../shared/types.ts";
import { PlanBlock } from "../PlanBlock";

export function PanelPlan({ entries }: { entries: PlanEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="panel-plan">
        <p className="panel-note">No plan yet</p>
      </div>
    );
  }
  return (
    <div className="panel-plan">
      <PlanBlock entries={entries} />
    </div>
  );
}
