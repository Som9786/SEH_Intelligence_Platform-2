import { useRef } from 'react';
import { ChevronRight, Search, Table2 } from 'lucide-react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { SideFlyout } from '../../../../shared/components/SideFlyout';
import { tableFilterActions, useTableFilter } from '../state/tableFilterStore';
import { useTableList } from '../hooks/useTableList';
import { ReviewDot } from './ReviewDot';
import { groupTablesByArea } from '../utils/groupTablesByArea';
import type { TableListItem } from '../types/tableDetails';

export const TABLE_DETAILS_PATH = '/db-catalog/tables';
export const TABLE_FLYOUT_ID = 'table-flyout';

/**
 * Browse and filter the catalog's tables in the same side panel as Data behind this. The search
 * box is focused on open and stays at the top while the list scrolls.
 */
export function TableFlyout({ onClose }: { onClose: () => void }) {
  const { query, groupMode, expandedAreas } = useTableFilter();
  const searchRef = useRef<HTMLInputElement>(null);

  const list = useTableList(query);
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const activeId =
    location.pathname === TABLE_DETAILS_PATH ? (params.get('table') ?? '') : '';
  const searching = query.trim().length > 0;
  const { groups } = groupTablesByArea(list.tables, groupMode);

  const open = (id: string) => {
    void navigate(`${TABLE_DETAILS_PATH}?table=${encodeURIComponent(id)}`);
    onClose();
  };
  const item = (table: TableListItem) => (
    <li key={table.id}>
      <button
        type="button"
        className={'tf-item' + (table.id === activeId ? ' active' : '')}
        aria-current={table.id === activeId ? 'true' : undefined}
        title={`${table.schemaName}.${table.name}`}
        onClick={() => open(table.id)}
      >
        <Table2 size={15} aria-hidden="true" />
        <span className="tf-item-name">{`${table.schemaName}.${table.name}`}</span>
        <ReviewDot tableId={table.id} />
      </button>
    </li>
  );

  let body;
  if (list.isPending) body = <p className="dbt-text">Loading tables…</p>;
  else if (list.isError)
    body = (
      <div className="ia-error" role="alert">
        <p>Tables could not be loaded.</p>
        <button
          type="button"
          className="td-action"
          onClick={() => void list.refetch()}
        >
          Retry
        </button>
      </div>
    );
  else if (list.tables.length === 0)
    body = (
      <p className="dbt-text">
        {searching ? 'No matching tables' : 'No tables in this catalog'}
      </p>
    );
  else
    body = (
      <>
        {groups.map((group) => {
          const open_ =
            groupMode === 'all' || searching || expandedAreas.has(group.key);
          return (
            <section className="dbt-section tf-group" key={group.key}>
              <button
                type="button"
                className="tf-group-head"
                aria-expanded={open_}
                disabled={groupMode === 'all' || searching}
                onClick={() => tableFilterActions.toggleArea(group.key)}
              >
                {groupMode === 'area' && (
                  <ChevronRight
                    size={14}
                    aria-hidden="true"
                    className={open_ ? 'is-open' : ''}
                  />
                )}
                <span>{group.label}</span>
                <small>{group.tables.length}</small>
              </button>
              {open_ && <ul className="tf-list">{group.tables.map(item)}</ul>}
            </section>
          );
        })}
        {list.hasNextPage && (
          <button
            type="button"
            className="td-action tf-more"
            disabled={list.isFetchingNextPage}
            onClick={() => void list.fetchNextPage()}
          >
            {list.isFetchingNextPage ? 'Loading…' : 'Show more'}
          </button>
        )}
      </>
    );

  return (
    <SideFlyout
      id={TABLE_FLYOUT_ID}
      kicker="Search tables"
      title="Database Tables"
      subtitle={
        <span aria-live="polite">
          {list.isSuccess ? `${list.total} tables in the catalog` : ''}
        </span>
      }
      closeLabel="Close table filter"
      initialFocus={searchRef}
      onClose={onClose}
    >
      <div className="tf-controls">
        <label className="eq-search">
          <Search size={16} aria-hidden="true" />
          <input
            ref={searchRef}
            type="search"
            aria-label="Filter database tables"
            placeholder="Search tables…"
            value={query}
            onChange={(event) =>
              tableFilterActions.setQuery(event.target.value)
            }
          />
        </label>
        <div className="tf-modes" role="group" aria-label="Group tables">
          <button
            type="button"
            aria-pressed={groupMode === 'all'}
            onClick={() => tableFilterActions.setGroupMode('all')}
          >
            All tables
          </button>
          <button
            type="button"
            aria-pressed={groupMode === 'area'}
            onClick={() => tableFilterActions.setGroupMode('area')}
          >
            By area
          </button>
        </div>
      </div>
      {body}
    </SideFlyout>
  );
}
