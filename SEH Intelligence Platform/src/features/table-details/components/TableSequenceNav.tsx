import { ChevronLeft, ChevronRight } from 'lucide-react';

export function TableSequenceNav({
  position,
  total,
  previousId,
  previousName,
  nextId,
  nextName,
  hasMore,
  onSelect,
  onFetchNext,
}: {
  position: number;
  total: number;
  previousId: string | null;
  previousName: string | null;
  nextId: string | null;
  nextName: string | null;
  hasMore: boolean;
  onSelect: (id: string) => void;
  onFetchNext: () => Promise<string | null>;
}) {
  const canNext = nextId !== null || hasMore;
  const next = async () => {
    const id = nextId ?? (await onFetchNext());
    if (id) onSelect(id);
  };
  const percent =
    position > 0 && total > 0
      ? Math.min(100, Math.round((position / total) * 100))
      : 0;
  return (
    <div className="td-sequence" role="group" aria-label="Table navigation">
      <div className="td-sequence-buttons">
        <button
          type="button"
          className="td-sequence-button"
          aria-label={
            previousName ? `Previous table: ${previousName}` : 'Previous table'
          }
          title={previousName ?? undefined}
          disabled={previousId === null}
          onClick={() => previousId && onSelect(previousId)}
        >
          <ChevronLeft size={16} aria-hidden="true" />
          <span className="td-sequence-text">
            <small>Previous</small>
          </span>
        </button>
        <button
          type="button"
          className="td-sequence-button td-sequence-next"
          aria-label={nextName ? `Next table: ${nextName}` : 'Next table'}
          title={nextName ?? undefined}
          disabled={!canNext}
          onClick={() => {
            void next();
          }}
        >
          <span className="td-sequence-text td-sequence-text-end">
            <small>Next</small>
          </span>
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>
      <div className="td-sequence-position">
        <span aria-live="polite">
          {position > 0 ? `Table ${position} of ${total}` : ''}
        </span>
        <span className="td-progress" aria-hidden="true">
          <span style={{ width: `${percent}%` }} />
        </span>
      </div>
    </div>
  );
}
