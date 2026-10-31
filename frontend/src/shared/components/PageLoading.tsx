/** Shown while a page's code loads, the first time the page is opened. */
export function PageLoading() {
  return (
    <div className="state-panel" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <p>Loading…</p>
    </div>
  );
}
