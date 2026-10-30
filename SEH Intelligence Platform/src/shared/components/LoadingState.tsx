export function LoadingState() {
  return (
    <div className="state-panel" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <h2>Loading catalog summary</h2>
      <p>Preparing the database overview.</p>
    </div>
  );
}
