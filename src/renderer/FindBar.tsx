type Props = {
  query: string;
  onQuery: (value: string) => void;
  count: number;
  index: number;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
};

export function FindBar({
  query,
  onQuery,
  count,
  index,
  onPrev,
  onNext,
  onClose,
}: Props) {
  return (
    <div className="find-bar" role="search">
      <input
        className="find-input"
        autoFocus
        value={query}
        placeholder="Find in conversation"
        aria-label="Find in conversation"
        onChange={(e) => onQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onClose();
            return;
          }
          if (e.key !== "Enter") return;
          e.preventDefault();
          if (e.shiftKey) onPrev();
          else onNext();
        }}
      />
      <span className="find-count">{count === 0 ? "0 of 0" : `${index + 1} of ${count}`}</span>
      <button
        type="button"
        className="find-nav"
        aria-label="Previous match"
        onClick={onPrev}
      >
        Prev
      </button>
      <button type="button" className="find-nav" aria-label="Next match" onClick={onNext}>
        Next
      </button>
      <button type="button" className="find-close" aria-label="Close find" onClick={onClose}>
        ×
      </button>
    </div>
  );
}
