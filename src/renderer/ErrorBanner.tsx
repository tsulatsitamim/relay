import { IconWarning } from "./icons";

type Props = {
  message: string;
  onRetry: () => void;
};

export function ErrorBanner({ message, onRetry }: Props) {
  return (
    <div className="error-banner" role="alert">
      <span className="error-banner-icon" aria-hidden>
        <IconWarning />
      </span>
      <span className="error-banner-text">{message}</span>
      <button type="button" className="error-banner-retry" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}
