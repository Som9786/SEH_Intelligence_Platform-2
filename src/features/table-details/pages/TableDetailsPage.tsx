import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { PageHeading } from '../../../shared/components/PageHeading';
import { useReview, useSaveReview } from '../hooks/useReview';
import { useTable } from '../hooks/useTable';
import { useTableSequence } from '../hooks/useTableSequence';
import { DocumentationTab } from '../components/DocumentationTab';
import { ResourceState } from '../components/ResourceState';
import { ReviewModal } from '../components/ReviewModal';
import { TableActions } from '../components/TableActions';
import { TableHeaderCard } from '../components/TableHeaderCard';
import { TableSequenceNav } from '../components/TableSequenceNav';
import { ColumnsCard } from '../components/ColumnsCard';
import { KeysCard } from '../components/KeysCard';
import { RelationshipMap } from '../components/RelationshipMap';
import { isFileNotFound } from '../../../platform/files/fileDataService';

const tabs = ['Overview', 'Documentation'] as const;
type Tab = (typeof tabs)[number];

/** Visible tab names; the ids above stay stable because documents link to `?tab=Documentation`. */
const tabLabels: Record<Tab, string> = {
  Overview: 'Schema',
  Documentation: 'Documentation',
};

export function TableDetailsPage() {
  const [params, setParams] = useSearchParams();
  const id = params.get('table') ?? '';
  const [tab, setTab] = useState<Tab>(
    (params.get('tab') as Tab) === 'Documentation'
      ? 'Documentation'
      : 'Overview',
  );
  useEffect(() => {
    setTab(
      params.get('tab') === 'Documentation' ? 'Documentation' : 'Overview',
    );
  }, [id, params]);
  const table = useTable(id);
  const review = useReview(id);
  const saveReview = useSaveReview();
  // Remember which table the dialog was opened for, so moving to another table closes it.
  const [reviewFor, setReviewFor] = useState<string | null>(null);
  const reviewOpen = reviewFor === id && Boolean(id);
  const sequence = useTableSequence(id);
  useEffect(() => {
    if (!id && sequence.firstId)
      setParams({ table: sequence.firstId }, { replace: true });
  }, [id, sequence.firstId, setParams]);
  const select = (nextId: string) => {
    setParams(nextId ? { table: nextId } : {});
    setTab('Overview');
  };
  const notFound = table.isError && isFileNotFound(table.error);

  const tablist = (
    <div className="td-tabs" role="tablist" aria-label="Table detail sections">
      {tabs.map((item) => (
        <button
          key={item}
          id={`tab-${tabs.indexOf(item)}`}
          role="tab"
          aria-selected={tab === item}
          aria-controls="table-tab-panel"
          tabIndex={tab === item ? 0 : -1}
          type="button"
          onClick={() => setTab(item)}
          onKeyDown={(event) => {
            const current = tabs.indexOf(item);
            const next =
              event.key === 'ArrowRight'
                ? (current + 1) % tabs.length
                : event.key === 'ArrowLeft'
                  ? (current - 1 + tabs.length) % tabs.length
                  : event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? tabs.length - 1
                      : -1;
            if (next >= 0) {
              event.preventDefault();
              setTab(tabs[next]);
              const buttons =
                event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                  '[role="tab"]',
                );
              buttons?.[next]?.focus();
            }
          }}
        >
          {tabLabels[item]}
        </button>
      ))}
    </div>
  );

  return (
    <div className="page-content">
      <PageHeading
        title="Table Details"
        description="Explore each table's columns, keys, relationships and documentation."
        badge={
          table.data && (
            <TableActions
              table={table.data}
              showingAi={tab === 'Documentation'}
              hasReview={Boolean(review.data)}
              onReview={() => {
                saveReview.reset();
                setReviewFor(id);
              }}
              onToggleAi={() =>
                setTab(tab === 'Documentation' ? 'Overview' : 'Documentation')
              }
            />
          )
        }
      />
      {!id ? (
        <section className="panel table-detail-panel">
          <ResourceState
            kind="empty"
            title="Select a table from the sidebar, or search for one above."
          />
        </section>
      ) : table.isPending ? (
        <section className="panel table-detail-panel">
          <ResourceState kind="loading" title="Loading table details…" />
        </section>
      ) : table.isError ? (
        <section className="panel table-detail-panel">
          <ResourceState
            kind={notFound ? 'empty' : 'error'}
            title={
              notFound
                ? 'Table not found.'
                : 'Table details could not be loaded.'
            }
            onRetry={() => {
              void table.refetch();
            }}
          />
        </section>
      ) : (
        <div className="td-page" key={id}>
          <TableHeaderCard
            detail={table.data}
            review={review.isError ? null : review.data}
            tabs={tablist}
            nav={
              <TableSequenceNav
                position={sequence.position}
                total={sequence.total}
                previousId={sequence.previousId}
                previousName={sequence.previousName}
                nextId={sequence.nextId}
                nextName={sequence.nextName}
                hasMore={sequence.hasMore}
                onSelect={select}
                onFetchNext={sequence.fetchNextId}
              />
            }
          />
          <div
            id="table-tab-panel"
            role="tabpanel"
            aria-labelledby={`tab-${tabs.indexOf(tab)}`}
            className="td-panel"
          >
            {tab === 'Overview' && (
              <>
                <div className="td-row">
                  <ColumnsCard
                    columns={table.data.columns}
                    keys={{ tableId: table.data.id, ...table.data.keys }}
                  />
                  <KeysCard
                    data={{ tableId: table.data.id, ...table.data.keys }}
                    onNavigate={select}
                  />
                </div>
                <RelationshipMap tableId={table.data.id} onNavigate={select} />
              </>
            )}
            {tab === 'Documentation' && (
              <div className="td-card td-doc">
                <DocumentationTab document={table.data.documentation} />
              </div>
            )}
          </div>
        </div>
      )}
      {reviewOpen && (
        <ReviewModal
          tableId={id}
          review={review.data ?? null}
          saving={saveReview.isPending}
          error={
            saveReview.isError
              ? 'The review could not be saved.'
              : null
          }
          onSave={(draft) =>
            saveReview.mutate(draft, { onSuccess: () => setReviewFor(null) })
          }
          onCancel={() => setReviewFor(null)}
        />
      )}
    </div>
  );
}
