import { FileText } from 'lucide-react';
import { Button } from '@folio/ui/button';

export interface EmptyStateProps {
  onNewPage: () => void;
}

/** Shown when no page is selected — an invitation, not a void. */
export function EmptyState({ onNewPage }: EmptyStateProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-card bg-paper-deep">
        <FileText className="h-6 w-6 text-ink-faint" aria-hidden />
      </div>
      <h2 className="font-display text-2xl text-ink">Nothing open</h2>
      <p className="max-w-xs text-sm leading-relaxed text-ink-soft">
        Select a page from the sidebar, or start fresh with a blank one.
      </p>
      <Button variant="primary" onClick={onNewPage} className="mt-1">
        New page
      </Button>
    </div>
  );
}
