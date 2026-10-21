export function ErrorState({
  title,
  onRetry,
}: {
  title: string;
  onRetry: () => void;
}) {
  return (
    <div className="state-panel" role="alert">
      <h2>{title}</h2>
      <p>The catalog files are missing or unreadable.</p>
      <button className="button button-primary" type="button" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}
