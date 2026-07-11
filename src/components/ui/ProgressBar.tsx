export function ProgressBar({ value = 0, showLabel = true }: { value?: number; showLabel?: boolean }) {
  const normalized = Math.max(0, Math.min(100, value));

  return (
    <div className="flex items-center gap-3">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#ECECEF]">
        <div className="h-full rounded-full bg-accent" style={{ width: `${normalized}%` }} />
      </div>
      {showLabel ? <span className="w-10 text-right text-xs font-medium text-text-secondary">{normalized}%</span> : null}
    </div>
  );
}
