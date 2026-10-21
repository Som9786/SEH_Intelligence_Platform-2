export function CatalogMissingState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="state-panel" role="alert">
      <h2>No catalog has been published yet</h2>
      <p>
        Copy the generated catalog into the <code>catalog/</code> folder next to{' '}
        <code>index.html</code>, then select Retry.
      </p>
      <button className="button button-primary" type="button" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}
