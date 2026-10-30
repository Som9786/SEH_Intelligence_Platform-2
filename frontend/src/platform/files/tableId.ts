export function toTableId(schema: string, table: string): string {
  return `${schema}.${table}`;
}

export function parseTableId(tableId: string): {
  schema: string;
  table: string;
} {
  const separatorIndex = tableId.indexOf('.');
  if (separatorIndex <= 0 || separatorIndex === tableId.length - 1) {
    throw new Error(`Invalid table id: ${tableId}`);
  }
  return {
    schema: tableId.slice(0, separatorIndex),
    table: tableId.slice(separatorIndex + 1),
  };
}
