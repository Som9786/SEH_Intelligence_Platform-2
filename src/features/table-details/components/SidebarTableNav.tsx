import { ChevronRight, Search, Table2 } from 'lucide-react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import {
  sidebarFilterActions,
  useSidebarFilter,
} from '../state/sidebarFilterStore';
import { useSidebarTables } from '../hooks/useSidebarTables';
import { ReviewDot } from './ReviewDot';
import { groupTablesByArea } from '../utils/groupTablesByArea';
import type { TableListItem } from '../types/tableDetails';

export const TABLE_DETAILS_PATH = '/table-details';

export function SidebarTableNav({ onSelect }: { onSelect?: () => void }) {
  const { query, groupMode, expandedAreas } = useSidebarFilter();
  const list = useSidebarTables(query);
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const activeId =
    location.pathname === TABLE_DETAILS_PATH ? (params.get('table') ?? '') : '';
  const searching = query.trim().length > 0;
  const { groups } = groupTablesByArea(list.tables, groupMode);

  const open = (id: string) => {
    void navigate(`${TABLE_DETAILS_PATH}?table=${encodeURIComponent(id)}`);
    onSelect?.();
  };
  const item = (table: TableListItem, key: string) => (
    <button
      key={key}
      type="button"
      className={'side-table-item' + (table.id === activeId ? ' active' : '')}
      aria-current={table.id === activeId ? 'true' : undefined}
      title={`${table.schemaName}.${table.name}`}
      onClick={() => open(table.id)}
    >
      <Table2 size={14} aria-hidden="true" />
      <span className="side-table-name">
        {groupMode === 'area'
          ? `${table.schemaName}.${table.name}`
          : table.name}
      </span>
      <ReviewDot tableId={table.id} />
    </button>
  );

  let body;
  if (list.isPending) body = <p className="side-table-note">Loading tables…</p>;
  else if (list.isError)
    body = (
      <div className="side-table-note" role="alert">
        Tables are unavailable.{' '}
        <button type="button" onClick={() => void list.refetch()}>
          Retry
        </button>
      </div>
    );
  else if (list.tables.length === 0)
    body = (
      <p className="side-table-note">
        {searching ? 'No matching tables' : 'No tables in the catalog'}
      </p>
    );
  else
    body = (
      <>
        {groups.map((group) => {
          const open_ =
            groupMode === 'all' || searching || expandedAreas.has(group.key);
          return (
            <div className="side-table-group" key={group.key}>
              <button
                type="button"
                className="side-table-group-head"
                aria-expanded={open_}
                disabled={groupMode === 'all' || searching}
                onClick={() => sidebarFilterActions.toggleArea(group.key)}
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
              {open_ &&
                group.tables.map((table) =>
                  item(table, `${group.key}:${table.id}`),
                )}
            </div>
          );
        })}
        {list.hasNextPage && (
          <button
            type="button"
            className="side-table-more"
            disabled={list.isFetchingNextPage}
            onClick={() => void list.fetchNextPage()}
          >
            {list.isFetchingNextPage ? 'Loading…' : 'Show more'}
          </button>
        )}
      </>
    );

  return (
    <section className="side-tables" aria-label="Database tables">
      <div className="side-tables-head">
        <span>Database Tables</span>
        <small aria-live="polite">
          {list.isSuccess ? `${list.total} tables` : ''}
        </small>
      </div>
      <div className="side-table-search">
        <Search size={14} aria-hidden="true" />
        <input
          type="search"
          aria-label="Filter database tables"
          placeholder="Search tables…"
          value={query}
          onChange={(event) =>
            sidebarFilterActions.setQuery(event.target.value)
          }
        />
      </div>
      <div className="side-table-modes" role="group" aria-label="Group tables">
        <button
          type="button"
          aria-pressed={groupMode === 'all'}
          onClick={() => sidebarFilterActions.setGroupMode('all')}
        >
          All tables
        </button>
        <button
          type="button"
          aria-pressed={groupMode === 'area'}
          onClick={() => sidebarFilterActions.setGroupMode('area')}
        >
          By area
        </button>
      </div>
      <div className="side-table-scroll">{body}</div>
    </section>
  );
}
