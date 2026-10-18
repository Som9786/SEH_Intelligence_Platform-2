import { useEffect, useState } from 'react';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { fileTableDetailsService } from '../../../platform/files/adapters/FileTableDetailsService';

const PAGE_SIZE = 100;

export function useSidebarTables(query: string) {
  const [debounced, setDebounced] = useState(query);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(timer);
  }, [query]);
  const result = useInfiniteQuery({
    queryKey: ['sidebar-tables', debounced.trim()],
    queryFn: ({ pageParam }) =>
      fileTableDetailsService.listTables({
        q: debounced.trim(),
        schema: '',
        page: pageParam,
        pageSize: PAGE_SIZE,
      }),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.meta.page * last.meta.pageSize < last.meta.total
        ? last.meta.page + 1
        : undefined,
    placeholderData: keepPreviousData,
    retry: false,
  });
  const pages = result.data?.pages ?? [];
  const tables = pages.flatMap((page) => page.items);
  const seen = new Set<string>();
  return {
    ...result,
    tables: tables.filter((t) => !seen.has(t.id) && seen.add(t.id)),
    total: pages[0]?.meta.total ?? 0,
  };
}
