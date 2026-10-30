export function ResourceState({
  kind,
  title,
  onRetry,
}: {
  kind: 'loading' | 'error' | 'empty';
  title: string;
  onRetry?: () => void;
}) {
  return (
    <div
      className="table-resource-state"
      role={kind === 'error' ? 'alert' : 'status'}
    >
      {kind === 'loading' && <span className="spinner" aria-hidden="true" />}
      <p>{title}</p>
      {kind === 'error' && (
        <button
          className="button button-primary"
          type="button"
          onClick={onRetry}
        >
          Retry
        </button>
      )}
    </div>
  );
}
