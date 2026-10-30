import { TriangleAlert } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Keeps an error while drawing one part of a page (an answer, a widget, a page) to that part: it
 * shows "Something went wrong" with Try again instead of the whole app going blank. `compact` is
 * for a card; the default is for a page. A new resetKey (such as the page's address) clears it.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode; compact?: boolean; resetKey?: string },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      'Could not show this part of the page',
      error,
      info.componentStack,
    );
  }

  componentDidUpdate(previous: { resetKey?: string }) {
    if (this.state.error && previous.resetKey !== this.props.resetKey)
      this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    const retry = (
      <button
        type="button"
        className="td-action"
        onClick={() => this.setState({ error: null })}
      >
        Try again
      </button>
    );
    return this.props.compact ? (
      <div className="ia-error" role="alert">
        <p>Something went wrong showing this.</p>
        {retry}
      </div>
    ) : (
      <div className="page-content">
        <div className="state-panel" role="alert">
          <TriangleAlert size={28} aria-hidden="true" />
          <h2>Something went wrong</h2>
          <p>This page couldn't be shown. Try again, or open another page.</p>
          {retry}
        </div>
      </div>
    );
  }
}
