import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';
import { fileTableDetailsService } from '../../../../platform/files/adapters/FileTableDetailsService';
import { useCatalogDatabase } from '../../../../platform/files/catalogDatabase';
import type { TableRecord } from '../../table-details/types/tableDetails';
import type { ErTable } from '../utils/erLayout';

function toErTable(record: TableRecord): ErTable {
  return {
    id: record.id,
    name: record.name,
    schema: record.schemaName,
    description: record.description,
    descriptionInferred: record.descriptionInferred,
    rowCount: record.rowCount,
    columnCount: record.columnCount,
    areas: record.areas,
    columns: record.columns.map((c) => ({
      name: c.name,
      dataType: c.dataType,
      pk: c.isPrimaryKey,
      fk: c.isForeignKey,
    })),
  };
}

/** A table whose file could not be read still gets a card, just without columns. */
function placeholder(id: string): ErTable {
  const [schema, ...rest] = id.split('.');
  return {
    id,
    name: rest.join('.') || id,
    schema: rest.length ? schema : '',
    description: null,
    descriptionInferred: false,
    rowCount: null,
    columnCount: 0,
    areas: [],
    columns: [],
  };
}

/**
 * The explorer's tables: columns, row counts, descriptions and business areas for every table id.
 * It shares the query cache with Table Details, so a table opened there is not read twice.
 */
export function useErTables(ids: string[]) {
  const database = useCatalogDatabase();
  const results = useQueries({
    queries: ids.map((id) => ({
      queryKey: ['table', database, id],
      queryFn: () => fileTableDetailsService.getTable(id),
      staleTime: 5 * 60_000,
      retry: false,
    })),
  });
  const stamp = results
    .map((r) => `${r.status}:${r.dataUpdatedAt}:${r.errorUpdatedAt}`)
    .join('|');
  const idKey = ids.join('|');
  const tables = useMemo(
    () =>
      ids.map((id, i) => {
        const data = results[i]?.data;
        return data ? toErTable(data) : placeholder(id);
      }),
    // `stamp` changes exactly when a result does, so the list is not rebuilt on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [idKey, stamp],
  );
  return {
    tables,
    isPending: results.some((r) => r.isPending),
    failed: results.filter((r) => r.isError).length,
  };
}
