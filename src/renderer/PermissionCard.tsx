import type { PermissionRequest } from "../shared/types.ts";

type Props = {
  request: PermissionRequest;
  onAnswer: (requestId: string, optionId: string | null) => void;
};

function isReject(kind: string): boolean {
  return kind.startsWith("reject");
}

export function PermissionCard({ request, onAnswer }: Props) {
  const hasReject = request.options.some((option) => isReject(option.kind));
  return (
    <div className="permission" role="alertdialog" aria-label="Permission required">
      <div className="permission-head">
        <span className="permission-kicker">Permission required</span>
        <span className="permission-title">
          {request.title ?? request.kind ?? "Tool call"}
        </span>
      </div>
      <div className="permission-actions">
        {request.options.map((option) => (
          <button
            key={option.optionId}
            type="button"
            className={`permission-btn ${isReject(option.kind) ? "reject" : "allow"}`}
            onClick={() => onAnswer(request.id, option.optionId)}
          >
            {option.name}
          </button>
        ))}
        {hasReject ? null : (
          <button
            type="button"
            className="permission-btn deny"
            onClick={() => onAnswer(request.id, null)}
          >
            Deny
          </button>
        )}
      </div>
    </div>
  );
}
