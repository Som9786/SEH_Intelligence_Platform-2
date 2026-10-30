import { ChevronDown, List, Network, Search } from 'lucide-react';
import { Fragment, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { BackToDbCatalog } from '../../components/BackToDbCatalog';
import { PageHeading } from '../../../../shared/components/PageHeading';
import { RelationshipColumns } from '../../table-details/components/RelationshipColumns';
import { ErExplorer } from '../components/ErExplorer';
import { ResourceState } from '../../table-details/components/ResourceState';
import { useRelationshipIndex } from '../../table-details/hooks/useRelationshipIndex';
import {
  cardinalityShort,
  cardinalityText,
  type GraphEdge,
  databaseGraph,
} from '../../table-details/utils/relationshipGraph';

/** Constraint name, or a plain label when the catalog records none. */
const relationshipName = (edge: GraphEdge) =>
  edge.name ?? (edge.confirmed ? 'Foreign key' : 'Inferred join');
const tableLink = (id: string) =>
  `/db-catalog/tables?table=${encodeURIComponent(id)}`;

export function RelationshipsPage() {
  const index = useRelationshipIndex();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [descending, setDescending] = useState(false);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const toggle = (id: string) =>
    setExpanded((previous) => {
      const next = new Set(previous);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const [params, setParams] = useSearchParams();
  // Two views of the same data, kept in the URL so each one can be linked to.
  const mode = params.get('view') === 'list' ? 'list' : 'diagram';
  const show = (next: 'diagram' | 'list') =>
    setParams(next === 'list' ? { view: 'list' } : {}, { replace: true });

  const view = useMemo(() => {
    if (!index.data) return null;
    const whole = databaseGraph(index.data);
    return {
      whole,
      primaryKeys: new Map(
        whole.tables.map((t) => [t.id, t.primaryKey] as const),
      ),
    };
  }, [index.data]);

  const rows = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return (view?.whole.edges ?? [])
      .filter(
        (edge) =>
          !needle ||
          [
            relationshipName(edge),
            edge.from,
            edge.to,
            edge.confirmed ? 'confirmed' : 'inferred',
            ...edge.fromColumns,
            ...edge.toColumns,
          ].some((value) => value.toLocaleLowerCase().includes(needle)),
      )
      .sort(
        (a, b) =>
          (descending ? -1 : 1) *
          relationshipName(a).localeCompare(relationshipName(b)),
      );
  }, [view, query, descending]);

  const open = (id: string) => {
    void navigate(tableLink(id));
  };

  return (
    <div className="page-content rel-page">
      <PageHeading
        title="Relationships"
        description="How the tables in this catalog are connected."
        badge={
          // One view button that offers the view you are not on, then Back.
          <div className="td-actions">
            <button
              type="button"
              className="td-action"
              onClick={() => show(mode === 'diagram' ? 'list' : 'diagram')}
            >
              {mode === 'diagram' ? (
                <List size={16} aria-hidden="true" />
              ) : (
                <Network size={16} aria-hidden="true" />
              )}
              {mode === 'diagram' ? 'All relationships' : 'ER diagram'}
            </button>
            <BackToDbCatalog />
          </div>
        }
      />
      {index.isPending ? (
        <ResourceState kind="loading" title="Loading relationships…" />
      ) : index.isError || !view ? (
        <ResourceState
          kind="error"
          title="Relationships could not be loaded."
          onRetry={() => {
            void index.refetch();
          }}
        />
      ) : (
        <>
          {mode === 'diagram' && (
            <ErExplorer index={index.data} onOpenTable={open} />
          )}

          {mode === 'list' &&
            (view.whole.edges.length > 0 ? (
              <section className="td-card" aria-labelledby="rel-list-heading">
                <div className="td-card-head">
                  <div className="td-card-title td-card-title-stack">
                    <div className="td-card-title-row">
                      <h2 id="rel-list-heading">All relationships</h2>
                      <span className="td-count">
                        {rows.length} of {view.whole.edges.length}
                      </span>
                    </div>
                    <p>Every link in the diagram, one row each.</p>
                  </div>
                  <div className="td-tools">
                    <label className="td-search">
                      <Search size={14} aria-hidden="true" />
                      <span className="td-sr-only">Search relationships</span>
                      <input
                        type="search"
                        placeholder="Search relationships…"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                      />
                    </label>
                    <button
                      type="button"
                      className="td-tool-button"
                      onClick={() => setDescending(!descending)}
                    >
                      {descending ? 'Name Z–A' : 'Name A–Z'}
                    </button>
                  </div>
                </div>
                {rows.length === 0 ? (
                  <p className="td-note">No relationships match your search.</p>
                ) : (
                  <div className="td-table-scroll">
                    <table className="td-table td-dir-table">
                      <thead>
                        <tr>
                          <th scope="col">Relationship</th>
                          <th scope="col">Referencing table</th>
                          <th scope="col">Referenced table</th>
                          <th scope="col">Columns</th>
                          <th scope="col">Cardinality</th>
                          <th scope="col">Evidence</th>
                          <th scope="col">
                            <span className="td-sr-only">Details</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((edge) => {
                          const open = expanded.has(edge.id);
                          const panelId = `rel-${edge.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
                          return (
                            <Fragment key={edge.id}>
                              <tr className={open ? 'td-dir-open' : undefined}>
                                <th scope="row">
                                  <span className="td-dir-name">
                                    {relationshipName(edge)}
                                  </span>
                                </th>
                                <td>
                                  <Link
                                    className="td-link-button"
                                    to={tableLink(edge.from)}
                                  >
                                    {edge.from}
                                  </Link>
                                </td>
                                <td>
                                  <Link
                                    className="td-link-button"
                                    to={tableLink(edge.to)}
                                  >
                                    {edge.to}
                                  </Link>
                                </td>
                                <td>
                                  <RelationshipColumns
                                    edge={edge}
                                    primaryKeys={view.primaryKeys}
                                  />
                                </td>
                                <td>
                                  {cardinalityShort(edge.cardinality) || '—'}
                                </td>
                                <td>
                                  <span
                                    className={
                                      'td-chip ' +
                                      (edge.confirmed
                                        ? 'td-chip-confirmed'
                                        : 'td-badge-inferred')
                                    }
                                  >
                                    {edge.confirmed ? 'Confirmed' : 'Inferred'}
                                  </span>
                                </td>
                                <td className="td-dir-expand">
                                  <button
                                    type="button"
                                    className="td-dir-toggle"
                                    aria-expanded={open}
                                    aria-controls={panelId}
                                    aria-label={`${open ? 'Hide' : 'Show'} details for ${relationshipName(edge)}`}
                                    onClick={() => toggle(edge.id)}
                                  >
                                    <ChevronDown size={16} aria-hidden="true" />
                                  </button>
                                </td>
                              </tr>
                              {open && (
                                <tr className="td-dir-details-row">
                                  <td colSpan={7} id={panelId}>
                                    <dl className="td-dir-details">
                                      <dt>Cardinality</dt>
                                      <dd>{cardinalityText(edge)}</dd>
                                      <dt>Meaning</dt>
                                      <dd
                                        className={
                                          edge.confirmed
                                            ? undefined
                                            : 'inferred'
                                        }
                                      >
                                        {edge.meaning ?? 'No meaning recorded.'}
                                      </dd>
                                    </dl>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            ) : (
              <ResourceState
                kind="empty"
                title="No relationships in this catalog."
              />
            ))}
        </>
      )}
    </div>
  );
}
