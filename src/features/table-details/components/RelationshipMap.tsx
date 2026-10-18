import { useMemo, useState } from 'react';
import { useRelationshipIndex } from '../hooks/useRelationshipIndex';
import { neighbourhood } from '../utils/relationshipGraph';
import { RelationshipDiagram } from './RelationshipDiagram';
import { ResourceState } from './ResourceState';

export function RelationshipMap({
  tableId,
  onNavigate,
}: {
  tableId: string;
  onNavigate: (id: string) => void;
}) {
  const index = useRelationshipIndex();
  const [actionsSlot, setActionsSlot] = useState<HTMLElement | null>(null);
  const graph = useMemo(
    () => (index.data ? neighbourhood(index.data, tableId, 'all') : null),
    [index.data, tableId],
  );

  return (
    <section
      id="relationships"
      className="td-card td-relationships"
      aria-labelledby="relationships-heading"
    >
      <div className="td-card-head">
        <div className="td-card-title td-card-title-stack">
          <div className="td-card-title-row">
            <h2 id="relationships-heading" tabIndex={-1}>
              Relationships
            </h2>
            {graph && (
              <span
                className="td-count"
                title={`${graph.counts.incoming} tables reference this table; it references ${graph.counts.outgoing}`}
              >
                {graph.counts.incoming} in · {graph.counts.outgoing} out
              </span>
            )}
          </div>
          <p>Tables that reference {tableId}, and the tables it references.</p>
        </div>
        <div className="td-card-actions" ref={setActionsSlot} />
      </div>
      {index.isPending ? (
        <ResourceState kind="loading" title="Loading relationships…" />
      ) : index.isError || !graph ? (
        <ResourceState
          kind="error"
          title="Relationships could not be loaded."
          onRetry={() => {
            void index.refetch();
          }}
        />
      ) : graph.edges.length === 0 ? (
        <ResourceState
          kind="empty"
          title="This table has no relationships with other tables."
        />
      ) : (
        <RelationshipDiagram
          graph={graph}
          onNavigate={onNavigate}
          actionsSlot={actionsSlot}
        />
      )}
    </section>
  );
}
