import type { SessionAuthMethod } from "../shared/types.ts";

type Props = {
  methods: SessionAuthMethod[];
  busy: boolean;
  error?: string | null;
  onLogin: (methodId: string) => void;
};

export function AuthBanner({ methods, busy, error, onLogin }: Props) {
  return (
    <div className="auth-banner" role="alert">
      <span className="auth-banner-title">Authentication required</span>
      {methods.length === 0 ? (
        <span className="auth-banner-hint">
          Log in with the agent's CLI, then retry.
        </span>
      ) : (
        <>
          <span className="auth-banner-text">
            This agent needs you to log in before it can run.
          </span>
          <span className="auth-banner-actions">
            {methods.map((method) => (
              <button
                key={method.id}
                type="button"
                className="auth-banner-btn"
                aria-label={`Log in with ${method.name}`}
                disabled={busy}
                onClick={() => onLogin(method.id)}
              >
                {method.name}
              </button>
            ))}
          </span>
        </>
      )}
      {error ? <span className="auth-error">{error}</span> : null}
    </div>
  );
}
