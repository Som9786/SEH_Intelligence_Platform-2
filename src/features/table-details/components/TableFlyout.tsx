import { useEffect, useRef, type KeyboardEvent } from 'react';
import { ChevronRight, Search, Table2, X } from 'lucide-react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { tableFilterActions, useTableFilter } from '../state/tableFilterStore';
import { useTableList } from '../hooks/useTableList';
import { ReviewDot } from './ReviewDot';
import { groupTablesByArea } from '../utils/groupTablesByArea';
import type { TableListItem } from '../types/tableDetails';

export const TABLE_DETAILS_PATH = '/table-details';
export const TABLE_FLYOUT_ID = 'table-flyout';

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

/**
 * Browse and filter the catalog's tables in a panel on the right of the screen. While it is open,
 * Tab stays inside it; Escape or the close button closes it, and focus goes back to whatever
 * opened it.
 */
export function TableFlyout({ onClose }: { onClose: () => void }) {
  const { query, groupMode, expandedAreas } = useTableFilter();
  const panelRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const opener = document.activeElement;
    searchRef.current?.focus();
    return () => {
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, []);

  const list = useTableList(query);
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const activeId =
    location.pathname === TABLE_DETAILS_PATH ? (params.get('table') ?? '') : '';
  const searching = query.trim().length > 0;
  const { groups } = groupTablesByArea(list.tables, groupMode);

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab' || !panelRef.current) return;
    const focusable = [
      ...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
    ];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  const open = (id: string) => {
    void navigate(`${TABLE_DETAILS_PATH}?table=${encodeURIComponent(id)}`);
    onClose();
  };
  const item = (table: TableListItem, key: string) => (
    <button
      key={key}
      type="button"
      className={'tf-item' + (table.id === activeId ? ' active' : '')}
      aria-current={table.id === activeId ? 'true' : undefined}
      title={`${table.schemaName}.${table.name}`}
      onClick={() => open(table.id)}
    >
      <Table2 size={14} aria-hidden="true" />
      <span className="tf-item-name">
        {`${table.schemaName}.${table.name}`}
      </span>
      <ReviewDot tableId={table.id} />
    </button>
  );

  let body;
  if (list.isPending) body = <p className="tf-note">Loading tables…</p>;
  else if (list.isError)
    body = (
      <div className="tf-note" role="alert">
        Tables could not be loaded.{' '}
        <button type="button" onClick={() => void list.refetch()}>
          Retry
        </button>
      </div>
    );
  else if (list.tables.length === 0)
    body = (
      <p className="tf-note">
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
            <div className="tf-group" key={group.key}>
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
            className="tf-more"
            disabled={list.isFetchingNextPage}
            onClick={() => void list.fetchNextPage()}
          >
            {list.isFetchingNextPage ? 'Loading…' : 'Show more'}
          </button>
        )}
      </>
    );

  return (
    <section
      ref={panelRef}
      id={TABLE_FLYOUT_ID}
      className="table-flyout"
      role="dialog"
      aria-modal="true"
      aria-labelledby="table-flyout-title"
      onKeyDown={onKeyDown}
    >
      <div className="tf-head">
        <h2 id="table-flyout-title">Database Tables</h2>
        <small aria-live="polite">
          {list.isSuccess ? `${list.total} tables` : ''}
        </small>
        <button
          className="tf-close"
          type="button"
          aria-label="Close table filter"
          onClick={onClose}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      <div className="tf-search">
        <Search size={14} aria-hidden="true" />
        <input
          ref={searchRef}
          type="search"
          aria-label="Filter database tables"
          placeholder="Search tables…"
          value={query}
          onChange={(event) => tableFilterActions.setQuery(event.target.value)}
        />
      </div>
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
      <div className="tf-scroll">{body}</div>
    </section>
  );
}
