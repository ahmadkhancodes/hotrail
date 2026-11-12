import { CopyButton } from "@/components/app/copy-button";

/** A mono command with a copy button: the CLI line that sits beside every primary CTA. */
export function CommandChip({ command }: { command: string }) {
  return (
    <div className="flex min-w-0 max-w-full items-center gap-2 rounded-sm border border-border-input bg-surface py-1 pl-3 pr-1">
      <code className="min-w-0 overflow-x-auto whitespace-nowrap font-mono caption-2 text-text"><span aria-hidden className="text-text-muted">$ </span>{command}</code>
      <CopyButton value={command} />
    </div>
  );
}
