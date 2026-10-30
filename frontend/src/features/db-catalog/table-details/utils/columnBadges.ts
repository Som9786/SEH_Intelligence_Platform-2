import type { Column, KeysResponse } from '../types/tableDetails';
import { formatSqlType } from './columnPresentation';

export interface ColumnRow {
  id: string;
  name: string;
  typeLabel: string;
  nullableLabel: 'Yes' | 'No';
  description: string | null;
  descriptionInferred: boolean;
  defaultValue: string | null;
  pk: boolean;
  identity: boolean;
  fk: boolean;
  fkTarget: string | null;
}

export function buildColumnRows(
  columns: Column[],
  keys?: KeysResponse,
): ColumnRow[] {
  const targets = new Map<string, string>();
  for (const key of keys?.foreignKeys ?? [])
    for (const pair of key.columnPairs)
      if (!targets.has(pair.sourceColumnId))
        targets.set(
          pair.sourceColumnId,
          `${key.targetSchemaName}.${key.targetTableName}`,
        );
  return columns.map((column) => ({
    id: column.id,
    name: column.name,
    typeLabel: formatSqlType(column),
    nullableLabel: column.nullable ? 'Yes' : 'No',
    description: column.description,
    descriptionInferred: column.descriptionInferred,
    defaultValue: column.defaultValue,
    pk: column.isPrimaryKey,
    identity: column.isIdentity,
    fk: column.isForeignKey || targets.has(column.id),
    fkTarget: targets.get(column.id) ?? null,
  }));
}
