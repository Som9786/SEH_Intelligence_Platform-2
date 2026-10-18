import { useSidebarFilter } from '../state/sidebarFilterStore';
import type { TableListItem } from '../types/tableDetails';
import { buildTableSequence } from '../utils/tableSequence';
import { useSidebarTables } from './useSidebarTables';

const qualified = (table: TableListItem | undefined) =>
  table ? `${table.schemaName}.${table.name}` : null;

export function useTableSequence(selectedId: string) {
  const { query } = useSidebarFilter();
  const filtered = useSidebarTables(query);
  const full = useSidebarTables('');
  const useFiltered =
    query.trim() !== '' && filtered.tables.some((t) => t.id === selectedId);
  const active = useFiltered ? filtered : full;
  const ids = active.tables.map((table) => table.id);
  const { index, previousId, nextId } = buildTableSequence(ids, selectedId);
  const byId = (id: string | null) =>
    id ? active.tables.find((table) => table.id === id) : undefined;
  const selected =
    full.tables.find((table) => table.id === selectedId) ??
    filtered.tables.find((table) => table.id === selectedId);
  return {
    ids,
    position: index + 1,
    total: active.total,
    previousId,
    previousName: qualified(byId(previousId)),
    nextId,
    nextName: qualified(byId(nextId)),
    areas: selected?.areas ?? [],
    hasMore: Boolean(active.hasNextPage) && index === ids.length - 1,
    firstId: full.tables[0]?.id ?? null,
    isLoading: active.isPending,
    isError: active.isError,
    async fetchNextId(): Promise<string | null> {
      const result = await active.fetchNextPage();
      const pages = result.data?.pages ?? [];
      return pages[pages.length - 1]?.items[0]?.id ?? null;
    },
  };
}
