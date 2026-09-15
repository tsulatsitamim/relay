export type Suggestion = { id: string; label: string; detail?: string };

type Props = {
  items: Suggestion[];
  activeIndex: number;
  onPick: (index: number) => void;
};

export function SuggestionMenu({ items, activeIndex, onPick }: Props) {
  if (items.length === 0) return null;
  return (
    <div className="suggest" role="listbox">
      {items.map((item, index) => (
        <button
          key={item.id}
          type="button"
          role="option"
          aria-selected={index === activeIndex}
          className={`suggest-item ${index === activeIndex ? "active" : ""}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPick(index)}
        >
          <span className="suggest-label">{item.label}</span>
          {item.detail ? <span className="suggest-detail">{item.detail}</span> : null}
        </button>
      ))}
    </div>
  );
}
