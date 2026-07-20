import { useId, type KeyboardEvent } from "react";

export type TabItem<T extends string> = {
  value: T;
  label: string;
};

type TabsProps<T extends string> = {
  items: readonly TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  panelId?: string;
  collapseOnMobile?: boolean;
  className?: string;
};

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  ariaLabel,
  panelId,
  collapseOnMobile = items.length > 5,
  className = "",
}: TabsProps<T>) {
  const generatedId = useId().replace(/:/g, "");

  function focusTab(index: number) {
    const item = items[index];
    if (!item) return;
    onChange(item.value);
    window.requestAnimationFrame(() => {
      document.getElementById(`${generatedId}-${item.value}`)?.focus();
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "Home") return focusTab(0);
    if (event.key === "End") return focusTab(items.length - 1);
    const direction = event.key === "ArrowRight" ? 1 : -1;
    focusTab((index + direction + items.length) % items.length);
  }

  const tabList = (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={[
        "max-w-full gap-1 rounded-card border border-border bg-surface p-1",
        collapseOnMobile ? "hidden flex-wrap sm:flex" : "inline-flex overflow-x-auto",
        className,
      ].join(" ")}
    >
      {items.map((item, index) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            id={`${generatedId}-${item.value}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={panelId}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={[
              "min-h-10 shrink-0 rounded-control border px-3 text-sm font-medium transition-colors duration-fast motion-reduce:transition-none",
              selected
                ? "border-border bg-fill-active text-text"
                : "border-transparent text-text-secondary hover:bg-fill-hover hover:text-text",
            ].join(" ")}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );

  if (!collapseOnMobile) return tabList;

  return (
    <>
      <label className="grid gap-1.5 sm:hidden">
        <span className="text-xs font-medium text-text-tertiary">Seção</span>
        <select
          aria-label={ariaLabel}
          value={value}
          onChange={(event) => onChange(event.target.value as T)}
          className="h-11 w-full rounded-control border border-border-control bg-surface px-3 text-sm font-medium text-text"
        >
          {items.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      {tabList}
    </>
  );
}
