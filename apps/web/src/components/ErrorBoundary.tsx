import { Component, type ReactNode } from 'react';
import { TriangleAlert } from 'lucide-react';
import { Button } from '@folio/ui/button';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Optional: clear the error state in addition to re-rendering. */
  onReset?: () => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * ErrorBoundary — keeps one crashing view from blanking the whole workspace.
 * Wraps the main content area; the sidebar and top bar stay alive so the user
 * can navigate elsewhere after a crash.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('[Folio] Unhandled render error:', error, info.componentStack);
  }

  private handleRetry = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        role="alert"
        className="mx-auto flex h-full w-full max-w-md flex-col items-center justify-center gap-3 px-8 text-center"
      >
        <div className="glass flex h-12 w-12 items-center justify-center rounded-card border border-hairline shadow-glass">
          <TriangleAlert className="h-5 w-5 text-ink-soft" aria-hidden />
        </div>
        <h2 className="font-display text-xl text-ink">Something went wrong</h2>
        <p className="text-sm leading-relaxed text-ink-soft">
          This view hit an unexpected error. Your work is saved locally — try again, or reload to
          start fresh.
        </p>
        <div className="mt-2 flex gap-2">
          <Button variant="secondary" onClick={this.handleRetry}>
            Try again
          </Button>
          <Button variant="primary" onClick={() => window.location.reload()}>
            Reload Folio
          </Button>
        </div>
        <details className="mt-2 max-w-full text-left">
          <summary className="cursor-pointer text-xs text-ink-faint hover:text-ink-soft">
            Error details
          </summary>
          <pre className="folio-scroll mt-2 max-h-32 overflow-auto rounded-control border border-hairline bg-paper-deep p-3 text-[11px] leading-relaxed text-ink-soft">
            {error.message}
          </pre>
        </details>
      </div>
    );
  }
}
