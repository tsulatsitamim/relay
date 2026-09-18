import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { SessionConfigOption, SessionConfigValue } from "../shared/types";

type Props = {
  option: SessionConfigOption;
  disabled?: boolean;
  onSelect: (value: string) => void;
};

const MAX_ROWS = 100;

function matchValues(
  option: SessionConfigOption,
  filter: string,
): SessionConfigValue[] {
  const query = filter.trim().toLowerCase();
  if (!query) return option.values;
  return option.values.filter(
    (value) =>
      value.value.toLowerCase().includes(query) ||
      value.name.toLowerCase().includes(query) ||
      (value.description ?? "").toLowerCase().includes(query),
  );
}

export function ConfigPicker({ option, disabled, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const chipRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => matchValues(option, filter), [option, filter]);
  const visible = matches.slice(0, MAX_ROWS);
  const current = option.values.find(
    (value) => value.value === option.currentValue,
  );
  const short = current?.name ?? option.currentValue;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && popoverRef.current?.contains(target)) return;
      if (target && chipRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function close() {
    setOpen(false);
    setFilter("");
    setActiveIndex(0);
  }

  function choose(value: string) {
    onSelect(value);
    close();
  }

  function onFilterKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (visible.length === 0) return;
      setActiveIndex((index) => (index + 1) % visible.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (visible.length === 0) return;
      setActiveIndex((index) => (index - 1 + visible.length) % visible.length);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const value = visible[activeIndex];
      if (value) choose(value.value);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      chipRef.current?.focus();
    }
  }

  return (
    <div className="config-picker">
      <button
        ref={chipRef}
        type="button"
        className="config-chip"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => {
          if (open) close();
          else setOpen(true);
        }}
      >
        {option.name}: {short}
      </button>
      {open ? (
        <div className="config-popover" ref={popoverRef}>
          <input
            autoFocus
            className="config-filter"
            value={filter}
            placeholder="Filter…"
            aria-label={`Filter ${option.name} values`}
            onChange={(event) => {
              setFilter(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={onFilterKeyDown}
          />
          <div className="config-list" role="listbox">
            {visible.map((value, index) => (
              <button
                key={value.value}
                type="button"
                role="option"
                className={`config-option${index === activeIndex ? " active" : ""}`}
                aria-selected={value.value === option.currentValue}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => choose(value.value)}
              >
                <span className="config-option-name">{value.name}</span>
                {value.description ? (
                  <span className="config-option-desc">{value.description}</span>
                ) : null}
              </button>
            ))}
            {matches.length > MAX_ROWS ? (
              <div className="config-more">Showing first 100 matches</div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
