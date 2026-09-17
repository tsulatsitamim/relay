import { useMemo } from "react";
import type { TranscriptEvent } from "../shared/types.ts";
import { CopyButton } from "./CopyButton";
import { formatTime } from "./time.ts";
import {
  formatDuration,
  turnDuration,
  turnEndedAt,
  turnText,
} from "./turn-duration.ts";
import { WorkingStatus } from "./WorkingStatus";

type Props = {
  events: TranscriptEvent[];
  lastPromptAt?: number;
  working: boolean;
};

export function TurnFooter({ events, lastPromptAt, working }: Props) {
  const duration = useMemo(
    () => turnDuration(events, lastPromptAt),
    [events, lastPromptAt],
  );
  const endedAt = useMemo(
    () => turnEndedAt(events, lastPromptAt),
    [events, lastPromptAt],
  );

  if (working) return <WorkingStatus active since={lastPromptAt} variant="row" />;
  if (duration == null || endedAt == null) return null;

  return (
    <div className="turn-footer">
      <span className="turn-duration">Worked for {formatDuration(duration)}</span>
      <span className="turn-time">{formatTime(endedAt)}</span>
      <div className="turn-actions">
        <CopyButton text={turnText(events)} label="Copy turn" />
      </div>
    </div>
  );
}
