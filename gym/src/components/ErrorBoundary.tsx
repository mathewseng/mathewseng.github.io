import { Component, type ErrorInfo, type PropsWithChildren, type ReactNode } from "react";

interface ErrorBoundaryState {
  error?: Error;
}

/* Catches a failed lazy chunk or a render error so the page never goes blank. */
export default class ErrorBoundary extends Component<
  PropsWithChildren<{ fallback?: (error: Error, reset: () => void) => ReactNode }>,
  ErrorBoundaryState
> {
  override state: ErrorBoundaryState = {};

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }

  reset = () => this.setState({ error: undefined });

  // The fallback takes focus so it is announced without being another live
  // region (the page has exactly one polite and one assertive, in AppShell).
  private fallbackRef = (element: HTMLDivElement | null) => {
    element?.focus({ preventScroll: true });
  };

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);
    return (
      <div
        ref={this.fallbackRef}
        tabIndex={-1}
        aria-labelledby="error-boundary-title"
        className="surface surface-danger mx-auto max-w-lg p-5 focus:outline-none"
      >
        <p id="error-boundary-title" className="text-sm font-bold">
          This view could not be shown
        </p>
        <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
          {error.message || "Something went wrong while rendering."} Your saved data is
          untouched.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="btn btn--primary" onClick={this.reset}>
            Try again
          </button>
          <button type="button" className="btn" onClick={() => window.location.reload()}>
            Reload page
          </button>
        </div>
      </div>
    );
  }
}
