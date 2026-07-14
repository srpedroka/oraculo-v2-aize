import { LoaderCircle } from "lucide-react";

interface AsyncDialogFallbackProps {
  label: string;
}

export function AsyncDialogFallback({ label }: AsyncDialogFallbackProps) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/20 p-4" role="status" aria-live="polite">
      <div className="flex items-center gap-3 rounded-card border border-border bg-surface px-5 py-4 text-sm font-medium text-text shadow-overlay">
        <LoaderCircle className="h-4 w-4 animate-spin text-accent motion-reduce:animate-none" aria-hidden="true" />
        {label}
      </div>
    </div>
  );
}
