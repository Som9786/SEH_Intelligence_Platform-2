import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Search, X } from 'lucide-react';
import { PageHeading } from '../../../../shared/components/PageHeading';
import { tableFilterActions, useTableFilter } from '../state/tableFilterStore';
import { useReview, useSaveReview } from '../hooks/useReview';
import { useTable } from '../hooks/useTable';
import { useTableSequence } from '../hooks/useTableSequence';
import { DocumentationTab } from '../components/DocumentationTab';
import { ResourceState } from '../components/ResourceState';
import { ReviewModal } from '../components/ReviewModal';
import { BackToDbCatalog } from '../../components/BackToDbCatalog';
import { TableActions } from '../components/TableActions';
import { TABLE_FLYOUT_ID } from '../components/TableFlyout';
import { TableHeaderCard } from '../components/TableHeaderCard';
import { TableSequenceNav } from '../components/TableSequenceNav';
import { ColumnsCard } from '../components/ColumnsCard';
import { KeysCard } from '../components/KeysCard';
import { RelationshipMap } from '../components/RelationshipMap';
import { isFileNotFound } from '../../../../platform/files/fileDataService';

const tabs = ['Overview', 'Documentation'] as const;
type Tab = (typeof tabs)[number];

/** Visible tab names; the ids above stay stable because documents link to `?tab=Documentation`. */
const tabLabels: Record<Tab, string> = {
  Overview: 'Schema',
  Documentation: 'Documentation',
};

export function TableDetailsPage() {
  const [params, setParams] = useSearchParams();
  const { flyoutOpen, query } = useTableFilter();
  // The flyout's filter also narrows Previous / Next, so show it here while the flyout is closed.
  const filter = query.trim();
  const id = params.get('table') ?? '';
  // The tab lives in the URL, so a copied link opens the same view.
  const tab: Tab =
    params.get('tab') === 'Documentation' ? 'Documentation' : 'Overview';
  const setTab = (next: Tab) =>
    setParams(
      (current) => {
        const updated = new URLSearchParams(current);
        if (next === 'Documentation') updated.set('tab', next);
        else updated.delete('tab');
        return updated;
      },
      { replace: true },
    );
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
        title="DB Tables"
        description="Explore each table's columns, keys, relationships and documentation."
        badge={
          <div className="td-actions">
            <div className={'td-browse' + (filter ? ' is-filtered' : '')}>
              <button
                type="button"
                className="td-action"
                aria-expanded={flyoutOpen}
                aria-controls={TABLE_FLYOUT_ID}
                aria-keyshortcuts="/"
                title="Search tables (press /)"
                onClick={() => tableFilterActions.setFlyoutOpen(!flyoutOpen)}
              >
                <Search size={16} aria-hidden="true" />
                Search tables
                {filter && (
                  <span className="td-filter-chip">
                    <span className="td-sr-only">, filtered by </span>
                    {filter}
                  </span>
                )}
              </button>
              {filter && (
                <button
                  type="button"
                  className="td-filter-clear"
                  aria-label={`Clear table filter "${filter}"`}
                  title="Clear filter"
                  onClick={() => tableFilterActions.setQuery('')}
                >
                  <X size={14} aria-hidden="true" />
                </button>
              )}
            </div>
            {table.data && (
              <TableActions
                table={table.data}
                hasReview={Boolean(review.data)}
                onReview={() => {
                  saveReview.reset();
                  setReviewFor(id);
                }}
              />
            )}
            <BackToDbCatalog />
          </div>
        }
      />
      {!id ? (
        <section className="panel table-detail-panel">
          <ResourceState
            kind="empty"
            title="Use Search tables (or press /) to pick a table."
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
          error={saveReview.isError ? 'The review could not be saved.' : null}
          onSave={(draft) =>
            saveReview.mutate(draft, { onSuccess: () => setReviewFor(null) })
          }
          onCancel={() => setReviewFor(null)}
        />
      )}
    </div>
  );
}
