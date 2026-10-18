export function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="state-panel" role="alert">
      <h2>Overview unavailable</h2>
      <p>
        The snapshot files are missing or could not be read. Please try again.
      </p>
      <button className="button button-primary" type="button" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}
