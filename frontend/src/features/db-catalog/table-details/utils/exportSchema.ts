import { downloadBlob } from '../../../../shared/utils/download';
import { createXlsx, type Cell } from '../../../../shared/utils/xlsx';
import type { TableRecord } from '../types/tableDetails';
import { buildColumnRows } from './columnBadges';

const HEADER = [
  'Column name',
  'Data type',
  'Nullable',
  'Key',
  'Default value',
  'Description',
];

/** One row per column, in the same order and wording as the Columns table on screen. */
export function schemaRows(table: TableRecord): Cell[][] {
  const rows = buildColumnRows(table.columns, {
    tableId: table.id,
    ...table.keys,
  });
  return [
    HEADER,
    ...rows.map((row): Cell[] => [
      row.name,
      row.typeLabel,
      row.nullableLabel,
      [
        row.pk && 'PK',
        row.fk && (row.fkTarget ? `FK → ${row.fkTarget}` : 'FK'),
        row.identity && 'Identity',
      ]
        .filter(Boolean)
        .join(', '),
      row.defaultValue,
      row.description,
    ]),
  ];
}

export function exportSchemaToExcel(table: TableRecord) {
  downloadBlob(
    createXlsx(table.name, schemaRows(table)),
    `${table.schemaName}.${table.name}-schema.xlsx`,
  );
}
