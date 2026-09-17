import { useEffect } from "react";
import type { PermissionRequest } from "../shared/types.ts";
import {
  PERSISTENT_GRANT_NOTE,
  permissionGrantNote,
  pickAutoAllowOption,
} from "../shared/permission.ts";
import { IconWarning } from "./icons";

type Props = {
  request: PermissionRequest;
  onAnswer: (requestId: string, optionId: string | null) => void;
  onAllowAll?: (requestId: string, optionId: string | null) => void;
  active?: boolean;
  onStep?: (delta: number) => void;
  position?: { index: number; total: number };
};

function isReject(kind: string): boolean {
  return kind.startsWith("reject");
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object") return false;
  const element = target as HTMLElement;
  if (element.isContentEditable) return true;
  return element.tagName === "INPUT" || element.tagName === "TEXTAREA";
}

export function PermissionCard({
  request,
  onAnswer,
  onAllowAll,
  active = true,
  onStep,
  position,
}: Props) {
  const hasReject = request.options.some((option) => isReject(option.kind));

  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      if (onStep && (event.key === "ArrowRight" || event.key === "ArrowLeft")) {
        event.preventDefault();
        onStep(event.key === "ArrowRight" ? 1 : -1);
        return;
      }
      if (event.key >= "1" && event.key <= "9") {
        const option = request.options[Number(event.key) - 1];
        if (!option) return;
        event.preventDefault();
        onAnswer(request.id, option.optionId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, onStep, onAnswer, request.id, request.options]);

  return (
    <div
      className={`permission${active ? " permission-active" : ""}`}
      role="alertdialog"
      aria-label="Permission required"
    >
      <div className="permission-head">
        <span className="permission-kicker">Permission required</span>
        <span className="permission-title">
          {request.title ?? request.kind ?? "Tool call"}
        </span>
        {position && position.total > 1 ? (
          <span className="permission-position">
            {position.index + 1} of {position.total}
          </span>
        ) : null}
      </div>
      <div className="permission-actions">
        {request.options.map((option, index) => {
          const note = permissionGrantNote(option);
          return (
            <button
              key={option.optionId}
              type="button"
              className={`permission-btn ${isReject(option.kind) ? "reject" : "allow"}${note ? " warn" : ""}`}
              title={note ?? undefined}
              onClick={() => onAnswer(request.id, option.optionId)}
            >
              {index < 9 ? (
                <span className="permission-key" aria-hidden>
                  {index + 1}
                </span>
              ) : null}
              {note ? (
                <span className="permission-warn">
                  <IconWarning />
                </span>
              ) : null}
              {option.name}
            </button>
          );
        })}
        {hasReject ? null : (
          <button
            type="button"
            className="permission-btn deny"
            onClick={() => onAnswer(request.id, null)}
          >
            Deny
          </button>
        )}
        {onAllowAll ? (
          <button
            type="button"
            className="permission-btn allow-all warn"
            title={PERSISTENT_GRANT_NOTE}
            onClick={() =>
              onAllowAll(request.id, pickAutoAllowOption(request.options))
            }
          >
            <span className="permission-warn">
              <IconWarning />
            </span>
            Allow all for this session
          </button>
        ) : null}
      </div>
    </div>
  );
}
