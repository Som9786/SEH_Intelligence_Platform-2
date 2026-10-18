import { Search } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router';
import { useSidebarTables } from '../hooks/useSidebarTables';

const MAX_RESULTS = 8;
const TABLE_DETAILS_PATH = '/table-details';

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

/** Top-bar search that jumps straight to a table. Press "/" anywhere to focus it. */
export function TopbarTableSearch() {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const navigate = useNavigate();
  const list = useSidebarTables(query);
  const results = list.tables.slice(0, MAX_RESULTS);
  const activeIndex = Math.min(active, Math.max(results.length - 1, 0));

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (
        event.key !== '/' ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        isTyping(event.target)
      )
        return;
      event.preventDefault();
      input.current?.focus();
      setOpen(true);
    };
    const onPointer = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
    };
  }, []);

  const choose = (id: string) => {
    setOpen(false);
    setQuery('');
    input.current?.blur();
    void navigate(`${TABLE_DETAILS_PATH}?table=${encodeURIComponent(id)}`);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      if (results.length)
        setActive(
          (activeIndex +
            (event.key === 'ArrowDown' ? 1 : -1) +
            results.length) %
            results.length,
        );
    } else if (event.key === 'Enter' && open && results[activeIndex]) {
      event.preventDefault();
      choose(results[activeIndex].id);
    } else if (event.key === 'Escape') {
      setOpen(false);
      input.current?.blur();
    }
  };

  const message = list.isError
    ? 'Tables are unavailable.'
    : list.isPending
      ? 'Loading tables…'
      : results.length === 0
        ? query.trim()
          ? 'No matching tables'
          : 'No tables in the catalog'
        : null;

  return (
    <div className="top-search" ref={root}>
      <Search size={16} aria-hidden="true" className="top-search-icon" />
      <input
        ref={input}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          open && results[activeIndex] ? `${listId}-${activeIndex}` : undefined
        }
        aria-label="Search database tables"
        placeholder="Search database tables…"
        autoComplete="off"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      <kbd className="top-search-key" aria-hidden="true">
        /
      </kbd>
      {open && (
        <div className="top-search-panel">
          {message ? (
            <p className="top-search-note" role="status">
              {message}
            </p>
          ) : (
            <ul id={listId} role="listbox" aria-label="Matching tables">
              {results.map((table, index) => (
                <li
                  key={table.id}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  className={
                    'top-search-option' +
                    (index === activeIndex ? ' is-active' : '')
                  }
                  onMouseEnter={() => setActive(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(table.id)}
                >
                  <strong>
                    {table.schemaName}.{table.name}
                  </strong>
                  <small>
                    {table.areas.map((area) => area.name).join(', ') ||
                      `${table.columnCount} columns`}
                  </small>
                </li>
              ))}
            </ul>
          )}
          {list.total > MAX_RESULTS && results.length === MAX_RESULTS && (
            <p className="top-search-note">
              Showing {MAX_RESULTS} of {list.total}. Keep typing to narrow down.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
