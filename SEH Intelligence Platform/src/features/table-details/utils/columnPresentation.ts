import type { Column } from '../types/tableDetails';
export function formatSqlType(column: Column): string {
  if (column.maxLength === 'MAX') return `${column.dataType}(MAX)`;
  if (column.maxLength !== null)
    return `${column.dataType}(${column.maxLength})`;
  if (column.precision !== null)
    return `${column.dataType}(${column.precision}${column.scale !== null ? `,${column.scale}` : ''})`;
  return column.dataType;
}
export function presentColumns(
  columns: Column[],
  query: string,
  descending: boolean,
): Column[] {
  const filtered = columns.filter((column) =>
    column.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );
  return [...filtered].sort(
    (a, b) => (descending ? -1 : 1) * a.name.localeCompare(b.name),
  );
}
