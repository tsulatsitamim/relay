import { IconPanelRight } from "../icons";

type Props = {
  pressed: boolean;
  count: number;
  disabled: boolean;
  onToggle: () => void;
};

export function PanelToggle({ pressed, count, disabled, onToggle }: Props) {
  const showBadge = !pressed && count > 0;
  return (
    <button
      type="button"
      className="icon-btn panel-toggle"
      aria-pressed={pressed}
      aria-label="Toggle right panel (⌘⌥B)"
      title="Toggle right panel (⌘⌥B)"
      disabled={disabled}
      onClick={onToggle}
    >
      <IconPanelRight />
      {showBadge ? (
        <span className="panel-toggle-badge">{count > 99 ? "99+" : count}</span>
      ) : null}
    </button>
  );
}
