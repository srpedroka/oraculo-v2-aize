import type { ReactNode } from "react";

const INLINE_MARKDOWN = /(\*\*[^*]+\*\*|\[[^\]]+\]\(https?:\/\/[^)\s]+\)|https?:\/\/[^\s]+)/g;

function inlineContent(value: string): ReactNode[] {
  return value.split(INLINE_MARKDOWN).filter(Boolean).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={`${part}-${index}`} className="font-semibold text-text">{part.slice(2, -2)}</strong>;
    }

    const markdownLink = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/);
    if (markdownLink) {
      return (
        <a key={`${part}-${index}`} href={markdownLink[2]} target="_blank" rel="noreferrer" className="font-medium text-accent underline decoration-border-control underline-offset-2">
          {markdownLink[1]}
        </a>
      );
    }

    if (/^https?:\/\//.test(part)) {
      const trailing = part.match(/[.,;:!?]+$/)?.[0] ?? "";
      const href = trailing ? part.slice(0, -trailing.length) : part;
      return (
        <span key={`${part}-${index}`}>
          <a href={href} target="_blank" rel="noreferrer" className="break-all font-medium text-accent underline decoration-border-control underline-offset-2">
            {href}
          </a>
          {trailing}
        </span>
      );
    }

    return part;
  });
}

export function ReadableText({ value, className = "" }: { value: string; className?: string }) {
  const lines = value.split(/\r?\n/);

  return (
    <div className={["space-y-2 text-sm leading-6 text-text", className].join(" ")}>
      {lines.map((rawLine, index) => {
        const line = rawLine.trim();
        if (!line) return null;

        const heading = line.match(/^#{1,6}\s+(.+)$/);
        if (heading) {
          return <p key={index} className="pt-1 font-semibold text-text">{inlineContent(heading[1])}</p>;
        }

        const bullet = line.match(/^(?:[-*•]|\d+[.)])\s+(.+)$/);
        if (bullet) {
          return (
            <div key={index} className="grid grid-cols-[12px_minmax(0,1fr)] gap-2 text-text-secondary">
              <span aria-hidden="true" className="text-text-tertiary">•</span>
              <p>{inlineContent(bullet[1])}</p>
            </div>
          );
        }

        return <p key={index} className="text-text-secondary">{inlineContent(line)}</p>;
      })}
    </div>
  );
}
